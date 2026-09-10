"""
Memory Optimizer Skill - 记忆优化器技能
作为agent的'记忆管家'，定期优化记忆池，解决知识容量停滞问题。

Author: Xiaomi MiMo Team
"""

import time
import logging
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timedelta
from collections import Counter

# 导入记忆管理器模块
try:
    from acp_proxy.plugins.memory.memory_manager import (
        get_all_memories,
        update_memory,
        archive_memory,
        delete_memory,
        summarize_memory,
        get_memory_by_id,
        get_memory_stats,
    )
except ImportError:
    # 备用导入路径
    from plugins.memory.memory_manager import (
        get_all_memories,
        update_memory,
        archive_memory,
        delete_memory,
        summarize_memory,
        get_memory_by_id,
        get_memory_stats,
    )

# 配置日志
logger = logging.getLogger(__name__)


class MemoryOptimizerSkill:
    """
    记忆优化器技能 - 智能记忆管家
    
    定期分析记忆池中的记忆，基于多维度价值评估算法识别低价值记忆，
    执行压缩、归档或删除操作，为新知识腾出空间。
    """

    # 默认配置参数
    DEFAULT_CONFIG = {
        "memory_capacity_limit": 50,              # 记忆池容量上限
        "trigger_threshold_ratio": 0.8,            # 触发阈值比例（80%时开始优化）
        "optimization_ratio": 0.10,                # 每次优化的最低比例（10%）
        "max_optimization_count": 10,              # 单次最大优化数量
        "conversation_interval": 10,               # 对话周期间隔（每10个对话周期触发）
        "age_decay_half_life_days": 30,            # 年龄衰减半衰期（天）
        "max_age_for_deletion_days": 90,           # 超过此天数可考虑删除
        "compression_threshold_chars": 500,        # 超过此字符数考虑压缩
        "low_score_threshold": 30,                 # 低分阈值（满分100）
        "critical_score_threshold": 15,            # 极低分阈值，可直接删除
        "weight_age": 0.30,                        # 年龄维度权重
        "weight_reference": 0.40,                  # 引用频率维度权重
        "weight_relevance": 0.30,                  # 相关性维度权重
        "protected_tags": ["core", "immutable", "protected", "permanent"],  # 受保护标签
        "user_goal_keywords": [                    # 用户目标关键词（可配置）
            "目标", "计划", "重要", "优先", "长期", "核心",
            "preference", "goal", "important", "objective",
            "关键", "必须", "记住", "不忘", "核心需求"
        ],
        "enable_compression": True,                # 是否启用压缩
        "enable_archive": True,                    # 是否启用归档
        "enable_deletion": True,                   # 是否启用删除
        "dry_run": False,                          # 干跑模式（仅记录不执行）
    }

    # 记忆操作类型
    class Action:
        KEEP = "keep"
        COMPRESS = "compress"
        ARCHIVE = "archive"
        DELETE = "delete"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化记忆优化器技能
        
        Args:
            config: 可选的配置参数覆盖
        """
        self.config = {**self.DEFAULT_CONFIG}
        if config:
            self.config.update(config)
        
        self.conversation_counter = 0
        self.last_optimization_time = None
        self.optimization_history: List[Dict[str, Any]] = []
        
        logger.info("MemoryOptimizerSkill 初始化完成，配置: %s", 
                    {k: v for k, v in self.config.items() if k != "user_goal_keywords"})

    def run(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        执行记忆优化的主入口方法
        
        Args:
            context: 执行上下文，可包含:
                - force: bool, 强制执行优化
                - manual_trigger: bool, 手动触发标记
                - user_goal_keywords: List[str], 动态更新的目标关键词
                - optimization_ratio: float, 覆盖优化比例
                
        Returns:
            优化结果报告字典
        """
        context = context or {}
        force = context.get("force", False)
        
        # 更新对话计数器
        self.conversation_counter += 1
        
        # 检查是否应该触发优化
        if not force and not self._should_trigger():
            logger.debug("当前不满足触发条件，跳过优化。对话计数: %d", self.conversation_counter)
            return {
                "status": "skipped",
                "reason": "未达到触发条件",
                "conversation_count": self.conversation_counter,
                "memory_count": self._get_current_memory_count(),
            }
        
        # 更新动态配置
        if "user_goal_keywords" in context:
            self.config["user_goal_keywords"].extend(context["user_goal_keywords"])
            self.config["user_goal_keywords"] = list(set(self.config["user_goal_keywords"]))
        
        if "optimization_ratio" in context:
            self.config["optimization_ratio"] = context["optimization_ratio"]
        
        logger.info("=" * 60)
        logger.info("开始执行记忆优化 (对话周期: %d)", self.conversation_counter)
        logger.info("=" * 60)
        
        try:
            result = self._execute_optimization(context)
            self.last_optimization_time = datetime.now()
            self.optimization_history.append({
                "timestamp": self.last_optimization_time.isoformat(),
                "result": result,
            })
            
            # 重置对话计数器
            self.conversation_counter = 0
            
            # 输出优化日志到观察流
            self._log_to_observation_stream(result)
            
            return result
            
        except Exception as e:
            logger.error("记忆优化执行失败: %s", str(e), exc_info=True)
            error_result = {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
            }
            return error_result

    def _should_trigger(self) -> bool:
        """
        判断是否应该触发优化
        
        Returns:
            是否满足触发条件
        """
        # 条件1: 对话周期达到间隔
        interval_reached = self.conversation_counter >= self.config["conversation_interval"]
        
        # 条件2: 记忆数接近容量上限
        memory_count = self._get_current_memory_count()
        capacity = self.config["memory_capacity_limit"]
        threshold = int(capacity * self.config["trigger_threshold_ratio"])
        near_capacity = memory_count >= threshold
        
        if interval_reached:
            logger.info("触发条件满足: 对话周期达到 %d", self.config["conversation_interval"])
            return True
        
        if near_capacity:
            logger.info("触发条件满足: 记忆数 %d 接近容量上限 %d (阈值: %d)", 
                       memory_count, capacity, threshold)
            return True
        
        return False

    def _execute_optimization(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行实际的优化逻辑
        
        Args:
            context: 执行上下文
            
        Returns:
            优化结果报告
        """
        # 1. 获取所有记忆
        all_memories = get_all_memories()
        initial_count = len(all_memories)
        
        logger.info("当前记忆池状态: 共 %d 条记忆", initial_count)
        
        if initial_count == 0:
            return {
                "status": "completed",
                "message": "记忆池为空，无需优化",
                "initial_count": 0,
                "final_count": 0,
                "operations": [],
            }
        
        # 2. 分离受保护和可优化的记忆
        protected_memories, optimizable_memories = self._separate_memories(all_memories)
        