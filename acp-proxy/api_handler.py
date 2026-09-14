import os
import json
import logging
from typing import Any, Dict, Optional

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_content_complete(content: str) -> bool:
    """
    检查内容是否完整，避免因上游输出截断导致不完整的数据。
    简单启发式检查：不以不完整的JSON或HTML标签结尾。
    """
    if not content:
        return True  # 空内容被视为完整（已由其他校验处理）
    
    # 检查JSON完整性：尝试解析为JSON，如果失败且以不完整结构结尾则返回False
    try:
        json.loads(content)
        return True
    except json.JSONDecodeError:
        pass
    
    # 检查HTML标签完整性：简单检查开闭标签数量
    if '<' in content and '>' in content:
        # 计算开闭标签数量
        open_tags = content.count('<')
        close_tags = content.count('>')
        if open_tags > close_tags:
            logger.warning(f"内容可能不完整：开标签数量({open_tags})大于闭标签数量({close_tags})")
            return False
    
    # 检查是否以不完整的JSON结构结尾
    stripped_content = content.strip()
    if stripped_content and (stripped_content[-1] in ['{', '[', ','] or stripped_content.endswith(('":', "':"))):
        logger.warning(f"内容可能以不完整的JSON结构结尾: {stripped_content[-20:]}")
        return False
    
    return True

def write_file(file_path: str, content: str) -> None:
    """
    写入文件到指定路径。
    假设调用前已进行参数校验。
    """
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"文件成功写入: {file_path}")
    except IOError as e:
        logger.error(f"文件写入失败，路径: {file_path}, 错误: {e}")
        raise

def handle_write_request(request_data: Dict[str, Any]) -> Dict[str, str]:
    """
    处理文件写入请求，包含严格的参数校验。
    """
    # 提取参数
    file_path: Optional[str] = request_data.get('file_path')
    content: Optional[str] = request_data.get('content')
    
    # 校验 file_path
    if file_path is None:
        error_msg = "参数错误: file_path 不能为 None"
        logger.error(error_msg)
        raise ValueError(error_msg)
    if not isinstance(file_path, str):
        error_msg = f"参数错误: file_path 必须是字符串，当前类型: {type(file_path)}"
        logger.error(error_msg)
        raise TypeError(error_msg)
    if file_path.strip() == '':
        error_msg = "参数错误: file_path 不能为空字符串"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # 校验 content
    if content is None:
        error_msg = "参数错误: content 不能为 None"
        logger.error(error_msg)
        raise ValueError(error_msg)
    if not isinstance(content, str):
        error_msg = f"参数错误: content 必须是字符串，当前类型: {type(content)}"
        logger.error(error_msg)
        raise TypeError(error_msg)
    if content.strip() == '':
        error_msg = "参数错误: content 不能为空字符串"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # 校验内容完整性
    if not is_content_complete(content):
        error_msg = f"参数错误: content 可能不完整或截断，请检查上游输出。文件路径: {file_path}"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # 调用文件写入函数
    write_file(file_path, content)
    
    return {"status": "success", "message": f"文件 {file_path} 写入成功"}

# 示例：如果这是直接运行的模块，可以添加一个测试或主函数
if __name__ == "__main__":
    # 示例请求数据
    test_data = {"file_path": "/tmp/test.txt", "content": "Hello, World!"}
    try:
        result = handle_write_request(test_data)
        print(result)
    except Exception as e:
        print(f"错误: {e}")