#!/usr/bin/env python3
"""
文件备份脚本
功能：将指定目录备份到目标位置
"""

import os
import shutil
import datetime
import sys


def backup_file(source_path, backup_dir):
    """
    备份单个文件
    """
    if not os.path.exists(source_path):
        print(f"源文件不存在: {source_path}")
        return False
    
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    filename = os.path.basename(source_path)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{os.path.splitext(filename)[0]}_{timestamp}{os.path.splitext(filename)[1]}"
    backup_path = os.path.join(backup_dir, backup_filename)
    
    try:
        shutil.copy2(source_path, backup_path)
        print(f"备份成功: {source_path} -> {backup_path}")
        return True
    except Exception as e:
        print(f"备份失败: {e}")
        return False


def backup_directory(source_dir, backup_dir):
    """
    备份整个目录
    """
    if not os.path.exists(source_dir):
        print(f"源目录不存在: {source_dir}")
        return False
    
    try:
        if not os.path.exists(backup_dir):
            os.makedirs(backup_dir)
        
        for item in os.listdir(source_dir):
            source_item = os.path.join(source_dir, item)
            backup_item = os.path.join(backup_dir, item)
            
            if os.path.isfile(source_item):
                shutil.copy2(source_item, backup_item)
                print(f"备份文件: {source_item} -> {backup_item}")
            elif os.path.isdir(source_item):
                backup_directory(source_item, backup_item)
        
        print(f"目录备份完成: {source_dir}")
        return True
    except Exception as e:
        print(f"目录备份失败: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print("用法: python file_backup.py <源路径> <备份目录>")
        print("示例: python file_backup.py /path/to/source /path/to/backup")
        sys.exit(1)
    
    source_path = sys.argv[1]
    backup_dir = sys.argv[2]
    
    if os.path.isfile(source_path):
        backup_file(source_path, backup_dir)
    elif os.path.isdir(source_path):
        backup_directory(source_path, backup_dir)
    else:
        print(f"无效的源路径: {source_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()