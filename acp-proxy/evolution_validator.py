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

def validate_cycle_record(record, min_improvements=0.1, validation_criteria=None):
    """
    验证进化周期记录是否有效。
    
    参数:
        record: 字典，包含周期记录数据，如 success, summary 等。
        min_improvements: 最小改进数量，默认为0.1，以支持微小改进。
        validation_criteria: 可选的可调用对象，接受record并返回布尔值，用于额外验证规则。
    
    返回:
        布尔值，表示记录是否有效。
    """
    # 获取字段
    success = record.get('success')
    summary = record.get('summary', '')
    
    # 核心原则：success字段必须为True
    if not success:
        return False
    
    # 使用函数提取改进数量
    improvement_count = extract_improvement_count(summary)
    
    # 使用改进数量与最小改进数量比对
    if improvement_count < min_improvements:
        return False
    
    # 应用可选的额外验证规则
    if validation_criteria is not None:
        if not validation_criteria(record):
            return False
    
    # 其他验证逻辑可以添加在这里
    return True

# 示例用法（如果需要，但主要逻辑已包含）
if __name__ == '__main__':
    # 测试记录
    record1 = {'success': False, 'summary': '规划1项改进，由self执行'}
    record2 = {'success': True, 'summary': '规划2项改进，由self执行'}
    record3 = {'success': False, 'summary': '规划0项改进，由self执行'}
    print(validate_cycle_record(record1))  # False (success为False)
    print(validate_cycle_record(record2))  # True (success为True且改进数量>0)
    print(validate_cycle_record(record3))  # False (success为False)
    
    # 示例：带validation_criteria的记录
    record4 = {'success': True, 'summary': '规划1项改进，由self执行', 'score': 0.8}
    # 自定义验证规则：检查score是否达到阈值
    def check_score(record):
        return record.get('score', 0) >= 0.7
    print(validate_cycle_record(record4, validation_criteria=check_score))  # True
    record5 = {'success': True, 'summary': '规划1项改进，由self执行', 'score': 0.6}
    print(validate_cycle_record(record5, validation_criteria=check_score))  # False (score低于阈值)