import logging
from datetime import datetime
from typing import Any, Dict, Optional

# 定义自定义日志级别
VALIDATION_FAILURE = 25  # 介于INFO(20)和WARNING(30)之间
VALIDATION_ERROR = 35    # 介于WARNING(30)和ERROR(40)之间

# 注册自定义日志级别
logging.addLevelName(VALIDATION_FAILURE, 'VALIDATION_FAILURE')
logging.addLevelName(VALIDATION_ERROR, 'VALIDATION_ERROR')

class ValidationLogger:
    """验证系统专用日志记录器"""
    
    def __init__(self, logger_name: str = 'acp_validation'):
        self.logger = logging.getLogger(logger_name)
        self._setup_default_handlers()
    
    def _setup_default_handlers(self):
        """设置默认的日志处理器"""
        if not self.logger.handlers:
            # 控制台处理器
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.DEBUG)
            
            # 文件处理器（按日期分割）
            try:
                file_handler = logging.FileHandler(
                    'logs/validation.log',
                    encoding='utf-8'
                )
                file_handler.setLevel(VALIDATION_FAILURE)
                self.logger.addHandler(file_handler)
            except FileNotFoundError:
                pass  # 文件处理器失败时不影响控制台输出
            
            # 日志格式
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(formatter)
            
            self.logger.addHandler(console_handler)
            self.logger.setLevel(logging.DEBUG)
    
    def validation_failure(
        self,
        cycle_id: str,
        failure_item: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None
    ):
        """记录验证失败项"""
        timestamp = datetime.now().isoformat()
        
        # 构建详细的失败信息
        failure_details = {
            'cycle_id': cycle_id,
            'timestamp': timestamp,
            'failure_type': failure_item.get('type', 'unknown'),
            'failure_id': failure_item.get('id', 'N/A'),
            'failure_message': failure_item.get('message', 'No description'),
            'severity': failure_item.get('severity', 'medium'),
            'context': context or {}
        }
        
        # 格式化日志消息
        if not message:
            message = f"Validation failure detected in cycle {cycle_id}"
        
        log_message = (
            f"{message}\n"
            f"  Cycle ID: {cycle_id}\n"
            f"  Time: {timestamp}\n"
            f"  Failure Type: {failure_details['failure_type']}\n"
            f"  Failure ID: {failure_details['failure_id']}\n"
            f"  Description: {failure_details['failure_message']}\n"
            f"  Severity: {failure_details['severity']}"
        )
        
        if context:
            log_message += f"\n  Context: {context}"
        
        self.logger.log(VALIDATION_FAILURE, log_message, extra={'failure_details': failure_details})
    
    def validation_error(
        self,
        cycle_id: str,
        error: Exception,
        context: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None
    ):
        """记录验证系统内部错误"""
        timestamp = datetime.now().isoformat()
        
        # 构建错误详情
        error_details = {
            'cycle_id': cycle_id,
            'timestamp': timestamp,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'context': context or {}
        }
        
        # 格式化日志消息
        if not message:
            message = f"Validation system error in cycle {cycle_id}"
        
        log_message = (
            f"{message}\n"
            f"  Cycle ID: {cycle_id}\n"
            f"  Time: {timestamp}\n"
            f"  Error Type: {error_details['error_type']}\n"
            f"  Error Message: {error_details['error_message']}"
        )
        
        if context:
            log_message += f"\n  Context: {context}"
        
        self.logger.log(VALIDATION_ERROR, log_message, extra={'error_details': error_details}, exc_info=True)
    
    def validation_success(
        self,
        cycle_id: str,
        validation_summary: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ):
        """记录验证成功"""
        timestamp = datetime.now().isoformat()
        
        log_message = (
            f"Validation completed successfully in cycle {cycle_id}\n"
            f"  Cycle ID: {cycle_id}\n"
            f"  Time: {timestamp}\n"
            f"  Summary: {validation_summary}"
        )
        
        if context:
            log_message += f"\n  Context: {context}"
        
        self.logger.info(log_message)

# 创建全局验证日志实例
validation_logger = ValidationLogger()

# 便捷函数
def log_validation_failure(
    cycle_id: str,
    failure_item: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None
):
    """记录验证失败项的便捷函数"""
    validation_logger.validation_failure(cycle_id, failure_item, context, message)

def log_validation_error(
    cycle_id: str,
    error: Exception,
    context: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None
):
    """记录验证系统错误的便捷函数"""
    validation_logger.validation_error(cycle_id, error, context, message)

def log_validation_success(
    cycle_id: str,
    validation_summary: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
):
    """记录验证成功的便捷函数"""
    validation_logger.validation_success(cycle_id, validation_summary, context)

# 使用示例（注释掉，仅供参考）
"""
# 示例1: 记录验证失败
failure_item = {
    'type': 'data_integrity',
    'id': 'check_001',
    'message': '数据完整性检查失败',
    'severity': 'high'
}
log_validation_failure(
    cycle_id='cycle_123',
    failure_item=failure_item,
    context={'source': 'database', 'affected_rows': 100},
    message='数据验证失败'
)

# 示例2: 记录系统错误
try:
    # 一些可能出错的操作
    raise ValueError("配置文件格式错误")
except Exception as e:
    log_validation_error(
        cycle_id='cycle_123',
        error=e,
        context={'config_file': 'settings.json'},
        message='验证系统内部错误'
    )

# 示例3: 记录验证成功
log_validation_success(
    cycle_id='cycle_123',
    validation_summary={'passed': 100, 'failed': 0, 'skipped': 2},
    context={'duration': '2.5s'}
)
"""