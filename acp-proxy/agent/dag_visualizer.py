"""
Agent执行计划可视化器 — 借鉴DAG可视化/React Flow/Airflow DAG
核心思想：将任务执行计划渲染为可视化的DAG图，支持前端展示
"""

import logging
import json
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.dag-visualizer")


@dataclass
class DAGNode:
    node_id: str
    label: str
    node_type: str = "task"  # "task", "decision", "start", "end"
    status: str = "pending"
    metadata: dict = field(default_factory=dict)
    x: float = 0.0
    y: float = 0.0


@dataclass
class DAGEdge:
    source: str
    target: str
    label: str = ""
    edge_type: str = "normal"  # "normal", "conditional", "error"


@dataclass
class DAGLayout:
    nodes: list[DAGNode] = field(default_factory=list)
    edges: list[DAGEdge] = field(default_factory=list)
    title: str = ""
    description: str = ""


class DAGVisualizer:
    """DAG可视化器"""

    def __init__(self):
        self._layouts: dict[str, DAGLayout] = {}

    def create_from_plan(
        self,
        plan_id: str,
        goal: str,
        steps: list[dict],
    ) -> DAGLayout:
        """从执行计划创建DAG布局"""
        nodes = []
        edges = []

        # 创建节点
        for i, step in enumerate(steps):
            node = DAGNode(
                node_id=step.get("id", f"step_{i}"),
                label=step.get("description", f"Step {i}")[:40],
                node_type="task",
                status=step.get("status", "pending"),
                x=float(i % 4) * 200,  # 简单网格布局
                y=float(i // 4) * 100,
            )
            nodes.append(node)

        # 创建边（基于依赖）
        for i, step in enumerate(steps):
            deps = step.get("depends_on", [])
            for dep in deps:
                edges.append(DAGEdge(
                    source=dep,
                    target=step.get("id", f"step_{i}"),
                ))

        # 如果没有依赖，创建线性链
        if not edges and len(steps) > 1:
            for i in range(len(steps) - 1):
                edges.append(DAGEdge(
                    source=steps[i].get("id", f"step_{i}"),
                    target=steps[i + 1].get("id", f"step_{i+1}"),
                ))

        layout = DAGLayout(
            nodes=nodes,
            edges=edges,
            title=goal[:60],
            description=f"执行计划: {len(nodes)}个步骤, {len(edges)}个依赖",
        )

        self._layouts[plan_id] = layout
        return layout

    def to_react_flow(self, plan_id: str) -> dict:
        """导出为React Flow格式"""
        layout = self._layouts.get(plan_id)
        if not layout:
            return {"nodes": [], "edges": []}

        rf_nodes = []
        for node in layout.nodes:
            rf_nodes.append({
                "id": node.node_id,
                "type": "custom",
                "position": {"x": node.x, "y": node.y},
                "data": {
                    "label": node.label,
                    "status": node.status,
                    "nodeType": node.node_type,
                    **node.metadata,
                },
            })

        rf_edges = []
        for i, edge in enumerate(layout.edges):
            rf_edges.append({
                "id": f"edge_{i}",
                "source": edge.source,
                "target": edge.target,
                "label": edge.label,
                "type": edge.edge_type,
            })

        return {"nodes": rf_nodes, "edges": rf_edges}

    def to_mermaid(self, plan_id: str) -> str:
        """导出为Mermaid格式"""
        layout = self._layouts.get(plan_id)
        if not layout:
            return "graph TD\n    empty[无数据]"

        lines = ["graph TD"]

        # 节点
        for node in layout.nodes:
            status_icon = {
                "pending": "⏳",
                "running": "🔄",
                "completed": "✅",
                "failed": "❌",
            }.get(node.status, "")
            safe_label = node.label.replace('"', "'")
            lines.append(f'    {node.node_id}["{status_icon} {safe_label}"]')

        # 边
        for edge in layout.edges:
            lines.append(f"    {edge.source} --> {edge.target}")

        return "\n".join(lines)

    def to_ascii(self, plan_id: str) -> str:
        """导出为ASCII DAG"""
        layout = self._layouts.get(plan_id)
        if not layout:
            return "(empty)"

        lines = [f"📊 {layout.title}", ""]

        # 构建依赖映射
        children: dict[str, list[str]] = {}
        for edge in layout.edges:
            children.setdefault(edge.source, []).append(edge.target)

        # 找根节点
        all_targets = {e.target for e in layout.edges}
        roots = [n.node_id for n in layout.nodes if n.node_id not in all_targets]

        # DFS遍历
        visited: set[str] = set()

        def dfs(node_id: str, prefix: str = "", is_last: bool = True):
            if node_id in visited:
                return
            visited.add(node_id)

            connector = "└── " if is_last else "├── "
            node = next((n for n in layout.nodes if n.node_id == node_id), None)
            if node:
                status_icon = {
                    "pending": "⏳",
                    "running": "🔄",
                    "completed": "✅",
                    "failed": "❌",
                }.get(node.status, "")
                lines.append(f"{prefix}{connector}{status_icon} {node.label[:50]}")

            child_prefix = prefix + ("    " if is_last else "│   ")
            kids = children.get(node_id, [])
            for i, kid in enumerate(kids):
                dfs(kid, child_prefix, i == len(kids) - 1)

        for root in roots:
            dfs(root)

        return "\n".join(lines)

    def get_stats(self) -> dict:
        return {
            "total_layouts": len(self._layouts),
            "total_nodes": sum(len(l.nodes) for l in self._layouts.values()),
            "total_edges": sum(len(l.edges) for l in self._layouts.values()),
        }
