import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any, Callable, Awaitable
from dataclasses import dataclass
from enum import Enum
from collections import deque
import websockets
from websockets.client import WebSocketClientProtocol
from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidURI
import socket

logger = logging.getLogger(__name__)

class ConnectionState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"

class ACPMessageError(Exception):
    """ACP消息相关错误"""
    pass

class ConnectionError(Exception):
    """连接相关错误"""
    pass

@dataclass
class ACPMessage:
    """ACP消息结构"""
    version: str
    msg_type: str
    payload: Dict[str, Any]
    timestamp: float
    message_id: str

class ACPWebSocketBridge:
    """ACP协议与WebSocket桥接器，带连接保护和错误处理"""
    
    def __init__(
        self,
        acp_endpoint: str,
        ws_endpoint: str,
        max_concurrent_messages: int = 100,
        connection_timeout: float = 10.0,
        message_timeout: float = 30.0,
        max_reconnect_attempts: int = 5,
        initial_backoff: float = 1.0,
        max_backoff: float = 30.0,
        message_handler: Optional[Callable[[ACPMessage], Awaitable[None]]] = None
    ):
        self.acp_endpoint = acp_endpoint
        self.ws_endpoint = ws_endpoint
        self.max_concurrent_messages = max_concurrent_messages
        self.connection_timeout = connection_timeout
        self.message_timeout = message_timeout
        self.max_reconnect_attempts = max_reconnect_attempts
        self.initial_backoff = initial_backoff
        self.max_backoff = max_backoff
        self.message_handler = message_handler
        
        self.state = ConnectionState.DISCONNECTED
        self.websocket: Optional[WebSocketClientProtocol] = None
        self.reconnect_attempts = 0
        self.last_connection_attempt = 0
        
        # 并发消息控制
        self.message_semaphore = asyncio.Semaphore(max_concurrent_messages)
        self.pending_messages: Dict[str, asyncio.Future] = {}
        self.message_queue: deque[ACPMessage] = deque()
        
        # 统计信息
        self.stats = {
            "messages_sent": 0,
            "messages_received": 0,
            "invalid_messages_dropped": 0,
            "connection_errors": 0,
            "message_timeouts": 0
        }
        
        # 事件处理器
        self._on_open_callbacks: list[Callable[[], Awaitable[None]]] = []
        self._on_close_callbacks: list[Callable[[int, str], Awaitable[None]]] = []
        self._on_error_callbacks: list[Callable[[Exception], Awaitable[None]]] = []
        
        # ACP协议版本验证
        self.supported_versions = {"1.0", "1.1", "2.0"}
        
    def add_on_open_callback(self, callback: Callable[[], Awaitable[None]]):
        """添加连接打开回调"""
        self._on_open_callbacks.append(callback)
    
    def add_on_close_callback(self, callback: Callable[[int, str], Awaitable[None]]):
        """添加连接关闭回调"""
        self._on_close_callbacks.append(callback)
    
    def add_on_error_callback(self, callback: Callable[[Exception], Awaitable[None]]):
        """添加错误回调"""
        self._on_error_callbacks.append(callback)
    
    async def validate_acp_message(self, message_data: dict) -> bool:
        """验证ACP消息格式和版本"""
        required_fields = ["version", "msg_type", "payload", "timestamp", "message_id"]
        
        # 检查必需字段
        for field in required_fields:
            if field not in message_data:
                logger.error(f"ACP消息缺少必需字段: {field}")
                return False
        
        # 验证版本
        version = message_data.get("version")
        if version not in self.supported_versions:
            logger.error(f"不支持的ACP协议版本: {version}, 支持的版本: {self.supported_versions}")
            return False
        
        # 验证消息类型
        msg_type = message_data.get("msg_type")
        if not isinstance(msg_type, str) or not msg_type.strip():
            logger.error(f"无效的消息类型: {msg_type}")
            return False
        
        # 验证payload
        payload = message_data.get("payload")
        if not isinstance(payload, dict):
            logger.error("payload必须是字典类型")
            return False
        
        # 验证timestamp
        timestamp = message_data.get("timestamp")
        if not isinstance(timestamp, (int, float)):
            logger.error("timestamp必须是数字类型")
            return False
        
        # 验证message_id
        message_id = message_data.get("message_id")
        if not isinstance(message_id, str) or not message_id.strip():
            logger.error("message_id必须是非空字符串")
            return False
        
        return True
    
    def create_acp_message(
        self, 
        msg_type: str, 
        payload: Dict[str, Any],
        version: str = "1.0"
    ) -> ACPMessage:
        """创建ACP消息"""
        return ACPMessage(
            version=version,
            msg_type=msg_type,
            payload=payload,
            timestamp=time.time(),
            message_id=f"{msg_type}_{int(time.time() * 1000)}"
        )
    
    async def send_acp_message(
        self, 
        message: ACPMessage,
        timeout: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """发送ACP消息，带超时和并发控制"""
        if self.state != ConnectionState.CONNECTED or not self.websocket:
            raise ConnectionError("WebSocket未连接")
        
        timeout = timeout or self.message_timeout
        
        # 检查并发消息数量
        if len(self.pending_messages) >= self.max_concurrent_messages:
            logger.warning("达到最大并发消息数限制")
            raise ACPMessageError("达到最大并发消息数限制")
        
        # 序列化消息
        message_dict = {
            "version": message.version,
            "msg_type": message.msg_type,
            "payload": message.payload,
            "timestamp": message.timestamp,
            "message_id": message.message_id
        }
        
        try:
            # 发送消息
            message_json = json.dumps(message_dict)
            await asyncio.wait_for(
                self.websocket.send(message_json),
                timeout=timeout
            )
            self.stats["messages_sent"] += 1
            logger.debug(f"发送ACP消息: {message.message_id}")
            
            # 创建Future等待响应
            future = asyncio.get_event_loop().create_future()
            self.pending_messages[message.message_id] = future
            
            # 等待响应
            try:
                response = await asyncio.wait_for(future, timeout=timeout)
                return response
            except asyncio.TimeoutError:
                self.stats["message_timeouts"] += 1
                logger.warning(f"消息超时: {message.message_id}")
                if message.message_id in self.pending_messages:
                    del self.pending_messages[message.message_id]
                raise ACPMessageError(f"消息超时: {message.message_id}")
                
        except ConnectionClosed:
            logger.error("连接已关闭")
            self.stats["connection_errors"] += 1
            raise ConnectionError("连接已关闭")
        except Exception as e:
            logger.error(f"发送消息失败: {e}")
            raise
    
    async def _handle_incoming_message(self, raw_message: str):
        """处理接收到的消息"""
        try:
            message_data = json.loads(raw_message)
            
            # 验证消息格式
            if not await self.validate_acp_message(message_data):
                self.stats["invalid_messages_dropped"] += 1
                logger.warning("丢弃无效消息")
                return
            
            # 创建ACPMessage对象
            message = ACPMessage(
                version=message_data["version"],
                msg_type=message_data["msg_type"],
                payload=message_data["payload"],
                timestamp=message_data["timestamp"],
                message_id=message_data["message_id"]
            )
            
            self.stats["messages_received"] += 1
            logger.debug(f"收到ACP消息: {message.message_id}")
            
            # 检查是否是对之前消息的响应
            if message.message_id in self.pending_messages:
                future = self.pending_messages.pop(message.message_id)
                if not future.done():
                    future.set_result(message.payload)
            
            # 调用消息处理器
            if self.message_handler:
                await self.message_handler(message)
                
        except json.JSONDecodeError as e:
            self.stats["invalid_messages_dropped"] += 1
            logger.error(f"JSON解析失败: {e}")
        except Exception as e:
            self.stats["invalid_messages_dropped"] += 1
            logger.error(f"处理消息时出错: {e}")
    
    async def _on_open(self):
        """WebSocket连接打开处理器"""
        logger.info("WebSocket连接已建立")
        self.state = ConnectionState.CONNECTED
        self.reconnect_attempts = 0
        
        # 执行注册的回调
        for callback in self._on_open_callbacks:
            try:
                await callback()
            except Exception as e:
                logger.error(f"on_open回调执行失败: {e}")
    
    async def _on_close(self, close_code: int, close_reason: str):
        """WebSocket连接关闭处理器"""
        logger.info(f"WebSocket连接关闭: 代码={close_code}, 原因={close_reason}")
        
        # 更新状态
        self.state = ConnectionState.DISCONNECTED
        self.websocket = None
        
        # 清理待处理的消息
        for future in self.pending_messages.values():
            if not future.done():
                future.set_exception(ConnectionError("连接已关闭"))
        self.pending_messages.clear()
        
        # 执行注册的回调
        for callback in self._on_close_callbacks:
            try:
                await callback(close_code, close_reason)
            except Exception as e:
                logger.error(f"on_close回调执行失败: {e}")
        
        # 触发重连
        if self.state == ConnectionState.DISCONNECTED:
            asyncio.create_task(self._reconnect())
    
    async def _on_error(self, error: Exception):
        """WebSocket错误处理器"""
        logger.error(f"WebSocket错误: {error}")
        self.stats["connection_errors"] += 1
        
        # 执行注册的回调
        for callback in self._on_error_callbacks:
            try:
                await callback(error)
            except Exception as e:
                logger.error(f"on_error回调执行失败: {e}")
    
    async def _reconnect(self):
        """指数退避重连策略"""
        if self.state == ConnectionState.RECONNECTING:
            return
        
        self.state = ConnectionState.RECONNECTING
        
        while self.reconnect_attempts < self.max_reconnect_attempts:
            try:
                # 计算退避时间
                backoff_time = min(
                    self.initial_backoff * (2 ** self.reconnect_attempts),
                    self.max_backoff
                )
                
                logger.info(f"尝试重连，等待 {backoff_time:.2f} 秒... (尝试 {self.reconnect_attempts + 1}/{self.max_reconnect_attempts})")
                await asyncio.sleep(backoff_time)
                
                # 尝试连接
                success = await self.connect()
                if success:
                    logger.info("重连成功")
                    return
                
            except Exception as e:
                logger.error(f"重连失败: {e}")
            
            self.reconnect_attempts += 1
        
        logger.error("达到最大重连次数，放弃重连")
        self.state = ConnectionState.DISCONNECTED
    
    async def connect(self) -> bool:
        """建立WebSocket连接"""
        if self.state == ConnectionState.CONNECTED:
            return True
        
        if self.state == ConnectionState.CONNECTING:
            return False
        
        self.state = ConnectionState.CONNECTING
        self.last_connection_attempt = time.time()
        
        try:
            # 连接WebSocket
            connect_task = asyncio.wait_for(
                websockets.connect(
                    self.ws_endpoint,
                    on_open=self._on_open,
                    on_close=self._on_close,
                    on_error=self._on_error,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5
                ),
                timeout=self.connection_timeout
            )
            
            self.websocket = await connect_task
            
            # 等待连接完全建立
            await asyncio.sleep(0.1)
            
            if self.state == ConnectionState.CONNECTED:
                logger.info("连接成功建立")
                return True
            else:
                logger.warning("连接建立但状态异常")
                return False
                
        except asyncio.TimeoutError:
            logger.error("连接超时")
            self.stats["connection_errors"] += 1
            await self._on_error(ConnectionError("连接超时"))
            return False
            
        except InvalidHandshake as e:
            logger.error(f"握手失败: {e}")
            self.stats["connection_errors"] += 1
            await self._on_error(e)
            return False
            
        except InvalidURI as e:
            logger.error(f"无效的URI: {e}")
            self.stats["connection_errors"] += 1
            await self._on_error(e)
            return False
            
        except ConnectionError as e:
            logger.error(f"连接错误: {e}")
            self.stats["connection_errors"] += 1
            await self._on_error(e)
            return False
            
        except Exception as e:
            logger.error(f"连接失败: {e}")
            self.stats["connection_errors"] += 1
            await self._on_error(e)
            return False
    
    async def disconnect(self):
        """断开WebSocket连接"""
        if self.websocket:
            try:
                await self.websocket.close(1000, "主动断开连接")
            except Exception as e:
                logger.error(f"关闭连接时出错: {e}")
        
        self.state = ConnectionState.DISCONNECTED
        self.websocket = None
    
    async def run(self):
        """运行桥接器主循环"""
        try:
            # 初始连接
            connected = await self.connect()
            if not connected:
                logger.error("初始连接失败，进入重连流程")
                await self._reconnect()
            
            # 主循环
            while self.state in [ConnectionState.CONNECTED, ConnectionState.RECONNECTING]:
                await asyncio.sleep(1)
                
        except KeyboardInterrupt:
            logger.info("接收到中断信号，正在关闭...")
        except Exception as e:
            logger.error(f"主循环出错: {e}")
        finally:
            await self.disconnect()
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            **self.stats,
            "state": self.state.value,
            "pending_messages": len(self.pending_messages),
            "reconnect_attempts": self.reconnect_attempts
        }