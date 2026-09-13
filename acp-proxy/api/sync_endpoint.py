import os
import json
import fcntl
from flask import Flask, request, jsonify
from datetime import datetime
from pathlib import Path
import tempfile

app = Flask(__name__)

# 数据文件路径
DATA_FILE = Path(__file__).parent / "dna_status.json"


def validate_dna_sync_data(data):
    """验证DNA同步数据的格式"""
    if not isinstance(data, dict):
        return False, "数据必须是字典格式"
    
    # 检查必需字段
    required_fields = ["cycle_id", "status", "timestamp"]
    for field in required_fields:
        if field not in data:
            return False, f"缺少必需字段: {field}"
    
    # 验证cycle_id格式
    if not isinstance(data["cycle_id"], str):
        return False, "cycle_id必须是字符串"
    
    # 验证status
    valid_statuses = ["active", "inactive", "error", "completed"]
    if data["status"] not in valid_statuses:
        return False, f"status必须是以下之一: {', '.join(valid_statuses)}"
    
    # 验证timestamp格式 (ISO格式)
    try:
        datetime.fromisoformat(data["timestamp"].replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return False, "timestamp必须是有效的ISO格式"
    
    # 验证可选字段
    if "cycle_count" in data and not isinstance(data["cycle_count"], int):
        return False, "cycle_count必须是整数"
    
    if "metadata" in data and not isinstance(data["metadata"], dict):
        return False, "metadata必须是字典格式"
    
    return True, ""


def load_dna_status_data():
    """加载DNA状态数据"""
    if not DATA_FILE.exists():
        return {"cycles": {}, "last_cycle_count": 0}
    
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"cycles": {}, "last_cycle_count": 0}


def save_dna_status_data(data):
    """保存DNA状态数据到文件，使用原子写入"""
    # 写入临时文件然后重命名，确保原子性
    try:
        with tempfile.NamedTemporaryFile(
            mode='w',
            dir=DATA_FILE.parent,
            prefix=f'.{DATA_FILE.name}.',
            suffix='.tmp',
            delete=False,
            encoding='utf-8'
        ) as tmp_file:
            json.dump(data, tmp_file, ensure_ascii=False, indent=2)
            tmp_file_path = tmp_file.name
        
        # 原子性重命名
        os.replace(tmp_file_path, DATA_FILE)
        return True
    except Exception as e:
        # 清理临时文件
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        return False


@app.route('/api/dna-sync', methods=['POST'])
def dna_sync_endpoint():
    """DNA状态同步端点"""
    # 验证请求数据
    if not request.is_json:
        return jsonify({
            "success": False,
            "error": "请求必须是JSON格式",
            "cycle_count": None
        }), 400
    
    data = request.get_json()
    
    # 验证数据格式
    is_valid, validation_message = validate_dna_sync_data(data)
    if not is_valid:
        return jsonify({
            "success": False,
            "error": f"数据验证失败: {validation_message}",
            "cycle_count": None
        }), 400
    
    # 使用文件锁确保并发写入安全
    lock_file_path = DATA_FILE.with_suffix('.lock')
    
    try:
        # 创建并获取文件锁
        with open(lock_file_path, 'w') as lock_file:
            fcntl.flock(lock_file, fcntl.LOCK_EX)  # 排他锁
            
            try:
                # 加载当前数据
                dna_data = load_dna_status_data()
                
                # 更新周期数据
                cycle_id = data["cycle_id"]
                dna_data["cycles"][cycle_id] = {
                    "status": data["status"],
                    "timestamp": data["timestamp"],
                    "metadata": data.get("metadata", {}),
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
                
                # 更新cycle_count
                current_count = data.get("cycle_count")
                if current_count is not None and isinstance(current_count, int):
                    dna_data["last_cycle_count"] = current_count
                else:
                    # 自动递增cycle_count
                    dna_data["last_cycle_count"] = dna_data.get("last_cycle_count", 0) + 1
                
                # 保存更新后的数据
                if save_dna_status_data(dna_data):
                    return jsonify({
                        "success": True,
                        "message": f"DNA状态同步成功: {cycle_id}",
                        "cycle_count": dna_data["last_cycle_count"],
                        "cycle_id": cycle_id,
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }), 200
                else:
                    return jsonify({
                        "success": False,
                        "error": "保存数据时发生错误",
                        "cycle_count": dna_data["last_cycle_count"]
                    }), 500
                    
            finally:
                # 释放文件锁
                fcntl.flock(lock_file, fcntl.LOCK_UN)
                
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"同步过程中发生错误: {str(e)}",
            "cycle_count": None
        }), 500


# 如果需要，可以添加其他同步相关的端点
@app.route('/api/sync/health', methods=['GET'])
def sync_health_check():
    """同步服务健康检查"""
    return jsonify({
        "status": "healthy",
        "service": "dna-sync",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }), 200

