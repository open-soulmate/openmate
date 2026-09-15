import re

def extract_improvement_count(summary):
    """
    从summary字符串中提取规划改进的数量。
    例如：
        '规划1项改进，由self执行' -> 1
        '规划0项改进，由self执行' -> 0
    """
    if not summary:
        return 0
    match = re.search(r'规划(\d+)项', summary)
    if match:
        return int(match.group(1))
    return 0

def validate_cycle_record(record, min_improvements=1):
    """
    验证进化周期记录是否有效。
    
    参数:
        record: 字典，包含周期记录数据，如 success, summary 等。
        min_improvements: 最小改进数量，默认为1。
    
    返回:
        布尔值，表示记录是否有效。
    """
    # 获取字段
    success = record.get('success')
    summary = record.get('summary', '')
    
    # 定义成功条件：接受 true，或 false 但有改进规划且不是0项
    success_condition_met = (
        success == True or
        (success == False and 
         '规划' in summary and 
         '0项' not in summary)
    )
    
    if not success_condition_met:
        return False
    
    # 使用函数提取改进数量
    improvement_count = extract_improvement_count(summary)
    
    # 使用改进数量与最小改进数量比对
    if improvement_count < min_improvements:
        return False
    
    # 其他验证逻辑可以添加在这里
    return True

# 示例用法（如果需要，但主要逻辑已包含）
if __name__ == '__main__':
    # 测试记录
    record1 = {'success': False, 'summary': '规划1项改进，由self执行'}
    record2 = {'success': True, 'summary': '规划2项改进，由self执行'}
    record3 = {'success': False, 'summary': '规划0项改进，由self执行'}
    print(validate_cycle_record(record1))  # True
    print(validate_cycle_record(record2))  # True
    print(validate_cycle_record(record3))  # False