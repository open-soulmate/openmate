# acp-proxy/evolution_cycle_controller.py

import logging
from typing import Dict, Any, Optional
from .validators import validate_cycle_record  # 假设重构后的验证器在validators模块中

class EvolutionCycleController:
    def __init__(self):
        self.cycle_active = False
        self.max_retries = 3
        self.current_retry = 0
        self.last_stable_state: Optional[Dict[str, Any]] = None
        self.logger = logging.getLogger(__name__)
        
    def start_evolution_cycle(self, validation_result: Dict[str, Any]) -> bool:
        """开始新的进化周期"""
        if self._should_start_cycle(validation_result):
            self.cycle_active = True
            self.current_retry = 0
            # 保存当前状态作为稳定点
            self.last_stable_state = {
                "validation_result": validation_result,
                "timestamp": self._get_current_timestamp(),
                "cycle_active": True
            }
            self.logger.info(f"Evolution cycle started. State saved: {self.last_stable_state}")
            self._execute_evolution()
            return True
        return False

    def handle_validation_result(self, validation_result: Dict[str, Any]) -> bool:
        """处理验证结果，决定是否终止当前周期"""
        # 使用重构后的验证器进行详细验证
        validation_details = validate_cycle_record(validation_result)
        status = validation_details.get("status", "failed")
        reason = validation_details.get("reason", "")
        improvement_count = validation_details.get("improvement_count", 0)
        
        # 记录详细的验证日志
        self.logger.info(
            f"Validation completed - Status: {status}, "
            f"Reason: {reason}, "
            f"Improvements found: {improvement_count}, "
            f"Record content: {validation_result}"
        )
        
        if status == "failed":
            self._terminate_cycle_with_error(validation_result, validation_details)
            return False
        else:
            # 状态为validated_pending或validated_success时正常结束
            self._complete_cycle_successfully(validation_result)
            return True

    def _get_validation_status(self, validation_result: Dict[str, Any]) -> str:
        """获取验证状态，支持新旧格式兼容"""
        # 首先使用重构后的验证器获取状态
        try:
            validation_details = validate_cycle_record(validation_result)
            return validation_details.get("status", "unknown")
        except Exception as e:
            self.logger.warning(f"Failed to use validate_cycle_record: {e}")
            # 降级为旧格式处理
            if "validation_status" in validation_result:
                return validation_result["validation_status"]
            
            success = validation_result.get("success", False)
            summary = validation_result.get("summary", "")
            
            if not success:
                return "failed"
            
            if "pending" in summary.lower():
                return "validated_pending"
            else:
                return "validated_success"

    def _should_start_cycle(self, validation_result: Dict[str, Any]) -> bool:
        """判断是否应该开始新周期"""
        status = self._get_validation_status(validation_result)
        return status != "failed"

    def _execute_evolution(self):
        """执行进化逻辑"""
        self.logger.info("Executing evolution logic...")
        # 这里是具体的进化执行代码
        pass

    def _terminate_cycle_with_error(self, validation_result: Dict[str, Any], 
                                  validation_details: Dict[str, Any]):
        """终止周期并处理错误"""
        self.cycle_active = False
        
        # 构建详细的错误信息
        error_info = {
            "error_type": "validation_failed",
            "validation_details": validation_details,
            "original_record": validation_result,
            "retry_count": self.current_retry,
            "timestamp": self._get_current_timestamp(),
            "failure_reason": validation_details.get("reason", "Unknown validation failure")
        }
        
        # 记录详细的错误日志
        self.logger.error(
            f"Cycle terminated due to validation failure. "
            f"Error info: {error_info}"
        )
        
        # 根据重试策略决定是否重试
        if self.current_retry < self.max_retries:
            self.current_retry += 1
            self.logger.info(f"Retrying cycle. Current retry: {self.current_retry}/{self.max_retries}")
            self._retry_cycle(validation_result)
        else:
            # 检查是否需要回退
            if self.current_retry >= 2:  # 连续失败次数超过阈值
                self.logger.warning(
                    f"Continuous failures ({self.current_retry} times) exceeded threshold. "
                    f"Initiating rollback to last stable state."
                )
                self._rollback_to_stable_state()
            else:
                self.logger.error("Maximum retries exceeded without rollback condition.")
                self._handle_final_failure(error_info)

    def _retry_cycle(self, validation_result: Dict[str, Any]):
        """重试当前周期"""
        self.logger.info("Retrying current cycle...")
        # 这里是重试逻辑
        self._execute_evolution()

    def _handle_final_failure(self, error_info: Dict[str, Any]):
        """处理最终失败情况"""
        self.logger.critical(f"Final failure occurred: {error_info}")
        # 这里是最终失败处理逻辑
        # 可以添加恢复机制或通知管理员
        pass

    def _rollback_to_stable_state(self):
        """回退到上一个稳定状态"""
        if self.last_stable_state:
            self.logger.info(f"Rolling back to stable state: {self.last_stable_state}")
            # 这里实现回退逻辑，例如恢复系统状态
            self.current_retry = 0  # 重置重试计数器
            self.logger.info("Rollback completed. Retry counter reset to 0.")
        else:
            self.logger.warning("No stable state available for rollback.")

    def _complete_cycle_successfully(self, validation_result: Dict[str, Any]):
        """成功完成周期"""
        self.cycle_active = False
        self.logger.info("Cycle completed successfully.")
        # 准备开始下一个周期
        self._prepare_next_cycle(validation_result)

    def _prepare_next_cycle(self, validation_result: Dict[str, Any]):
        """准备开始下一个周期"""
        self.logger.info("Preparing next cycle...")
        # 更新稳定状态为当前成功状态
        self.last_stable_state = {
            "validation_result": validation_result,
            "timestamp": self._get_current_timestamp(),
            "cycle_active": False
        }
        # 这里是准备下一个周期的逻辑
        pass

    def is_cycle_active(self) -> bool:
        """检查周期是否激活"""
        return self.cycle_active
    
    def _get_current_timestamp(self) -> str:
        """获取当前时间戳"""
        from datetime import datetime
        return datetime.now().isoformat()