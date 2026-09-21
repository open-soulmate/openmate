# acp-proxy/evolution_cycle_validator.py

import sqlite3
import logging

# 定义状态码
SUCCESS_CODE = 0      # 验证通过，无失败项
FAIL_CODE = 1         # 存在失败项
ERROR_CODE = -1       # 验证系统内部错误

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def validate_evolution_cycle():
    """
    验证进化周期：查询failure_memory.db中的失败项数量，并返回验证状态。
    
    返回值：
        int: 状态码（SUCCESS_CODE, FAIL_CODE, 或 ERROR_CODE）
    """
    try:
        # 连接数据库并查询失败项数量
        conn = sqlite3.connect('failure_memory.db')
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM failures")
        result = cursor.fetchone()
        
        # 检查查询结果
        if result is None:
            logger.error("数据库查询返回空结果，可能表结构异常")
            return ERROR_CODE
        
        failure_count = result[0]
        
        # 记录失败项数量
        logger.info(f"验证的失败项数量: {failure_count}")
        
        # 根据失败项数量返回状态码
        if failure_count == 0:
            logger.info("无失败项，验证通过")
            return SUCCESS_CODE
        else:
            logger.warning(f"存在 {failure_count} 个失败项，验证失败")
            return FAIL_CODE
            
    except sqlite3.Error as e:
        logger.error(f"数据库操作失败: {e}")
        return ERROR_CODE
    except Exception as e:
        logger.error(f"验证过程中发生未知错误: {e}")
        return ERROR_CODE
    finally:
        # 确保关闭数据库连接
        if 'conn' in locals():
            conn.close()