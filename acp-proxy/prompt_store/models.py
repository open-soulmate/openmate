"""
PromptStore 数据模型模块

定义 PromptTemplate 数据模型，用于表示提示词模板及其元数据。
支持版本管理、多租户隔离和变量模板。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class PromptTemplate:
    """
    提示词模板数据模型

    属性:
        name:       模板名称（同一 namespace 内唯一标识符）
        namespace:  命名空间（多租户隔离维度）
        content:    模板正文，可包含 {{variable}} 占位符
        version:    版本号，每次 save 自动递增
        variables:  从 content 中自动解析出的变量名列表
        tags:       标签列表，用于分类检索
        created_at: 创建/更新时间戳（UTC）
    """

    name: str
    namespace: str
    content: str
    version: int = 1
    variables: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        """初始化后自动从 content 中解析变量占位符"""
        if not self.variables:
            self.variables = self._extract_variables(self.content)

    @staticmethod
    def _extract_variables(content: str) -> list[str]:
        """
        从模板内容中提取所有 {{variable}} 占位符名称

        参数:
            content: 包含 {{var}} 占位符的模板文本

        返回:
            去重后的变量名列表（保持首次出现顺序）
        """
        pattern = r"\{\{(\w+)\}\}"
        seen: set[str] = set()
        result: list[str] = []
        for match in re.finditer(pattern, content):
            var_name = match.group(1)
            if var_name not in seen:
                seen.add(var_name)
                result.append(var_name)
        return result

    def to_dict(self) -> dict[str, Any]:
        """序列化为字典，方便 JSON 导出"""
        return {
            "name": self.name,
            "namespace": self.namespace,
            "content": self.content,
            "version": self.version,
            "variables": self.variables,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
        }

    def copy_with_version(self, new_version: int, new_content: str) -> PromptTemplate:
        """
        基于当前模板创建新版本副本

        参数:
            new_version: 新版本号
            new_content: 新的模板内容

        返回:
            新版本的 PromptTemplate 实例
        """
        return PromptTemplate(
            name=self.name,
            namespace=self.namespace,
            content=new_content,
            version=new_version,
            tags=list(self.tags),
        )
