# acp-proxy/plugins/dynamic_tool_creator.py
import json
import os
import re
import ast
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
import keyword

class DynamicToolCreator:
    """动态工具创建器插件，支持在运行时创建新的MCP工具"""
    
    def __init__(self, 
                 config: Optional[Dict[str, Any]] = None):
        """
        初始化动态工具创建器
        
        Args:
            config: 配置字典，可包含以下键：
                - tool_prefix: 工具命名前缀，默认为 'dynamic_'
                - tools_storage_path: 工具存储路径，默认为 'acp-proxy/tools/dynamic/'
                - index_file: 工具索引文件路径，默认为 'tools_index.json'
        """
        self.config = config or {}
        self.tool_prefix = self.config.get('tool_prefix', 'dynamic_')
        self.tools_storage_path = Path(self.config.get('tools_storage_path', 'acp-proxy/tools/dynamic/'))
        self.index_file = Path(self.config.get('index_file', 'tools_index.json'))
        
        # 确保存储目录存在
        self.tools_storage_path.mkdir(parents=True, exist_ok=True)
        
        # 加载或初始化工具索引
        self._load_index()
    
    def _load_index(self):
        """加载工具索引文件"""
        if self.index_file.exists():
            with open(self.index_file, 'r', encoding='utf-8') as f:
                self.tools_index = json.load(f)
        else:
            self.tools_index = {
                "version": "1.0",
                "created_at": datetime.now().isoformat(),
                "tools": {}
            }
            self._save_index()
    
    def _save_index(self):
        """保存工具索引文件"""
        with open(self.index_file, 'w', encoding='utf-8') as f:
            json.dump(self.tools_index, f, indent=2, ensure_ascii=False)
    
    def collect_requirement(self, conversation_history: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        分析对话历史，识别工具需求
        
        Args:
            conversation_history: 对话历史列表，每个元素包含 'role' 和 'content'
            
        Returns:
            工具需求字典，包含:
            - requirement: 识别出的需求描述
            - confidence: 置信度（0-1）
            - keywords: 匹配的关键词
        """
        # 定义工具需求关键词模式
        patterns = [
            r'需要.*?工具',
            r'想要.*?工具', 
            r'添加.*?功能',
            r'创建.*?工具',
            r'开发.*?功能',
            r'实现.*?工具',
            r'工具.*?需求',
            r'功能.*?需求'
        ]
        
        requirements = []
        all_text = ' '.join([msg.get('content', '') for msg in conversation_history])
        
        # 匹配所有模式
        for pattern in patterns:
            matches = re.findall(pattern, all_text, re.IGNORECASE)
            for match in matches:
                requirements.append({
                    'requirement': match,
                    'confidence': 0.8,
                    'keywords': [match]
                })
        
        # 如果没有明确的需求，尝试从最后几条消息中提取
        if not requirements and conversation_history:
            last_messages = conversation_history[-3:]
            for msg in last_messages:
                content = msg.get('content', '').lower()
                if '工具' in content or '功能' in content:
                    requirements.append({
                        'requirement': msg['content'],
                        'confidence': 0.6,
                        'keywords': ['工具', '功能']
                    })
        
        # 返回第一个需求或默认需求
        if requirements:
            return requirements[0]
        else:
            return {
                'requirement': '通用工具创建器',
                'confidence': 0.3,
                'keywords': ['通用']
            }
    