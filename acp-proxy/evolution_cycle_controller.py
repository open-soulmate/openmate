# acp-proxy/evolution_cycle_controller.py

class EvolutionCycleController:
    def __init__(self):
        self.cycle_active = False
        self.max_retries = 3
        self.current_retry = 0

    def start_evolution_cycle(self, validation_result):
        """开始新的进化周期"""
        if self._should_start_cycle(validation_result):
            self.cycle_active = True
            self.current_retry = 0
            self._execute_evolution()
            return True
        return False

    def handle_validation_result(self, validation_result):
        """处理验证结果，决定是否终止当前周期"""
        status = self._get_validation_status(validation_result)
        
        if status == "failed":
            self._terminate_cycle_with_error(validation_result)
            return False
        else:
            # 状态为validated_pending或validated_success时正常结束
            self._complete_cycle_successfully(validation_result)
            return True

    def _get_validation_status(self, validation_result):
        """获取验证状态，支持新旧格式兼容"""
        # 新格式：直接获取validation_status字段
        if "validation_status" in validation_result:
            return validation_result["validation_status"]
        
        # 旧格式兼容处理：根据success和summary字段映射
        success = validation_result.get("success", False)
        summary = validation_result.get("summary", "")
        
        if not success:
            return "failed"
        
        # 根据summary字段推断其他状态
        if "pending" in summary.lower():
            return "validated_pending"
        else:
            return "validated_success"

    def _should_start_cycle(self, validation_result):
        """判断是否应该开始新周期"""
        status = self._get_validation_status(validation_result)
        return status != "failed"

    def _execute_evolution(self):
        """执行进化逻辑"""
        # 这里是具体的进化执行代码
        pass

    def _terminate_cycle_with_error(self, validation_result):
        """终止周期并处理错误"""
        self.cycle_active = False
        error_info = {
            "error_type": "validation_failed",
            "details": validation_result,
            "retry_count": self.current_retry
        }
        
        # 根据重试策略决定是否重试
        if self.current_retry < self.max_retries:
            self.current_retry += 1
            self._retry_cycle(validation_result)
        else:
            self._handle_final_failure(error_info)

    def _retry_cycle(self, validation_result):
        """重试当前周期"""
        # 这里是重试逻辑
        self._execute_evolution()

    def _handle_final_failure(self, error_info):
        """处理最终失败情况"""
        # 这里是最终失败处理逻辑
        pass

    def _complete_cycle_successfully(self, validation_result):
        """成功完成周期"""
        self.cycle_active = False
        # 准备开始下一个周期
        self._prepare_next_cycle(validation_result)

    def _prepare_next_cycle(self, validation_result):
        """准备开始下一个周期"""
        # 这里是准备下一个周期的逻辑
        pass

    def is_cycle_active(self):
        """检查周期是否激活"""
        return self.cycle_active