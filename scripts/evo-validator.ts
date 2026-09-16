export interface ValidationResult {
  pass: boolean;
  reason?: string;
  details?: string[];
}

export function validateEvolution(changeset: any, improvements: number): ValidationResult {
  // 处理空变更集情况
  if (!changeset || (Array.isArray(changeset) && changeset.length === 0)) {
    return {
      pass: true,
      reason: 'no_changes',
      details: ['Change set is empty, skipping validation']
    };
  }

  // 处理0项改进情况
  if (improvements === 0) {
    return {
      pass: true,
      reason: 'no_improvements',
      details: ['No improvements detected, skipping validation']
    };
  }

  // 执行正常验证逻辑
  const validationDetails: string[] = [];
  let pass = true;

  // 示例验证规则（可根据实际需求扩展）
  if (typeof changeset !== 'object') {
    validationDetails.push('Invalid changeset format');
    pass = false;
  }

  if (improvements < 0) {
    validationDetails.push('Improvement count cannot be negative');
    pass = false;
  }

  return {
    pass,
    details: validationDetails.length > 0 ? validationDetails : ['Validation completed']
  };
}