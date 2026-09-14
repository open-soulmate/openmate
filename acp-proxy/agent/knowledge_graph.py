"""
知识图谱构建器 — 借鉴GraphRAG/LlamaIndex KnowledgeGraph + Neo4j模式
核心思想：从对话和文件中自动提取实体和关系，构建可查询的知识图谱
"""

import logging
import json
import time
import sqlite3
import hashlib
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.knowledge-graph")


@dataclass
class Entity:
    entity_id: str
    name: str
    entity_type: str  # "person", "concept", "file", "tool", "project", etc.
    properties: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    mention_count: int = 1


@dataclass
class Relation:
    relation_id: str
    source_entity: str
    target_entity: str
    relation_type: str  # "uses", "contains", "depends_on", "related_to", etc.
    weight: float = 1.0
    properties: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


class KnowledgeGraph:
    """知识图谱"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "knowledge-graph"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "graph.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS entities (
                    entity_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    properties TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    mention_count INTEGER DEFAULT 1
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_entities_name
                ON entities(name)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_entities_type
                ON entities(entity_type)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS relations (
                    relation_id TEXT PRIMARY KEY,
                    source_entity TEXT NOT NULL,
                    target_entity TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    properties TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    FOREIGN KEY (source_entity) REFERENCES entities(entity_id),
                    FOREIGN KEY (target_entity) REFERENCES entities(entity_id)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_relations_source
                ON relations(source_entity)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_relations_target
                ON relations(target_entity)
            """)
            conn.commit()

    def add_entity(
        self,
        name: str,
        entity_type: str = "concept",
        properties: Optional[dict] = None,
    ) -> Entity:
        """添加或更新实体"""
        entity_id = self._make_entity_id(name, entity_type)

        with sqlite3.connect(self.db_path) as conn:
            # 检查是否已存在
            existing = conn.execute(
                "SELECT entity_id, mention_count FROM entities WHERE entity_id = ?",
                (entity_id,),
            ).fetchone()

            if existing:
                # 更新mention_count
                conn.execute(
                    "UPDATE entities SET mention_count = mention_count + 1 WHERE entity_id = ?",
                    (entity_id,),
                )
                mention_count = existing[1] + 1
            else:
                conn.execute(
                    """INSERT INTO entities (entity_id, name, entity_type, properties, created_at, mention_count)
                       VALUES (?, ?, ?, ?, ?, 1)""",
                    (entity_id, name, entity_type,
                     json.dumps(properties or {}, ensure_ascii=False), time.time()),
                )
                mention_count = 1

            conn.commit()

        return Entity(
            entity_id=entity_id,
            name=name,
            entity_type=entity_type,
            properties=properties or {},
            mention_count=mention_count,
        )

    def add_relation(
        self,
        source_name: str,
        target_name: str,
        relation_type: str = "related_to",
        source_type: str = "concept",
        target_type: str = "concept",
        weight: float = 1.0,
        properties: Optional[dict] = None,
    ) -> Optional[Relation]:
        """添加关系（自动创建实体）"""
        source = self.add_entity(source_name, source_type)
        target = self.add_entity(target_name, target_type)

        relation_id = self._make_relation_id(source.entity_id, target.entity_id, relation_type)

        with sqlite3.connect(self.db_path) as conn:
            existing = conn.execute(
                "SELECT relation_id, weight FROM relations WHERE relation_id = ?",
                (relation_id,),
            ).fetchone()

            if existing:
                # 更新权重
                conn.execute(
                    "UPDATE relations SET weight = weight + ? WHERE relation_id = ?",
                    (weight, relation_id),
                )
            else:
                conn.execute(
                    """INSERT INTO relations
                       (relation_id, source_entity, target_entity, relation_type, weight, properties, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (relation_id, source.entity_id, target.entity_id, relation_type,
                     weight, json.dumps(properties or {}, ensure_ascii=False), time.time()),
                )
            conn.commit()

        return Relation(
            relation_id=relation_id,
            source_entity=source.entity_id,
            target_entity=target.entity_id,
            relation_type=relation_type,
            weight=weight,
            properties=properties or {},
        )

    def extract_from_text(self, text: str, context: str = "") -> dict:
        """从文本中自动提取实体和关系（简单规则实现）"""
        extracted_entities = []
        extracted_relations = []

        # 提取文件路径
        file_pattern = r"[/~][\w/.-]+\.\w+"
        for match in re.finditer(file_pattern, text):
            self.add_entity(match.group(), "file")
            extracted_entities.append(match.group())

        # 提取工具名（常见模式）
        tool_pattern = r"(?:call|use|invoke|run|execute)\s+(\w+)"
        for match in re.finditer(tool_pattern, text, re.IGNORECASE):
            tool_name = match.group(1)
            self.add_entity(tool_name, "tool")
            extracted_entities.append(tool_name)

        # 提取技术概念（大写缩写）
        concept_pattern = r"\b[A-Z]{2,}\b"
        for match in re.finditer(concept_pattern, text):
            concept = match.group()
            if concept not in ("OK", "API", "JSON", "HTTP", "SQL", "URL"):
                self.add_entity(concept, "concept")
                extracted_entities.append(concept)

        # 提取代码块中的函数名
        code_pattern = r"(?:def|function|class)\s+(\w+)"
        for match in re.finditer(code_pattern, text):
            func_name = match.group(1)
            self.add_entity(func_name, "function")
            extracted_entities.append(func_name)

        return {
            "entities_found": len(set(extracted_entities)),
            "entity_names": list(set(extracted_entities))[:10],
        }

    def query_neighbors(self, entity_name: str, depth: int = 2) -> dict:
        """查询实体的邻居（N跳）"""
        entity_id = self._make_entity_id(entity_name, "")

        visited: set[str] = set()
        frontier = [entity_id]
        result_nodes: list[dict] = []
        result_edges: list[dict] = []

        for _ in range(depth):
            next_frontier = []
            for eid in frontier:
                if eid in visited:
                    continue
                visited.add(eid)

                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    # 获取实体信息
                    entity = conn.execute(
                        "SELECT * FROM entities WHERE entity_id = ?", (eid,)
                    ).fetchone()
                    if entity:
                        result_nodes.append(dict(entity))

                    # 获取关系
                    relations = conn.execute(
                        """SELECT * FROM relations
                           WHERE source_entity = ? OR target_entity = ?""",
                        (eid, eid),
                    ).fetchall()

                    for rel in relations:
                        result_edges.append(dict(rel))
                        neighbor = rel["target_entity"] if rel["source_entity"] == eid else rel["source_entity"]
                        if neighbor not in visited:
                            next_frontier.append(neighbor)

            frontier = next_frontier

        return {
            "nodes": result_nodes,
            "edges": result_edges,
            "total_nodes": len(result_nodes),
            "total_edges": len(result_edges),
        }

    def find_path(self, source_name: str, target_name: str, max_depth: int = 5) -> list[str]:
        """查找两个实体之间的路径（BFS）"""
        source_id = self._make_entity_id(source_name, "")
        target_id = self._make_entity_id(target_name, "")

        if source_id == target_id:
            return [source_name]

        visited: set[str] = {source_id}
        queue: list[list[str]] = [[source_id]]

        for _ in range(max_depth):
            next_queue = []
            for path in queue:
                current = path[-1]
                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    relations = conn.execute(
                        """SELECT source_entity, target_entity FROM relations
                           WHERE source_entity = ? OR target_entity = ?""",
                        (current, current),
                    ).fetchall()

                    for rel in relations:
                        neighbor = rel["target_entity"] if rel["source_entity"] == current else rel["source_entity"]
                        if neighbor == target_id:
                            # 找到路径，获取实体名
                            full_path = path + [neighbor]
                            names = []
                            for eid in full_path:
                                entity = conn.execute(
                                    "SELECT name FROM entities WHERE entity_id = ?", (eid,)
                                ).fetchone()
                                names.append(entity[0] if entity else eid)
                            return names

                        if neighbor not in visited:
                            visited.add(neighbor)
                            next_queue.append(path + [neighbor])

            queue = next_queue

        return []

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            entities = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
            relations = conn.execute("SELECT COUNT(*) FROM relations").fetchone()[0]
            types = conn.execute(
                "SELECT entity_type, COUNT(*) FROM entities GROUP BY entity_type"
            ).fetchall()

        return {
            "total_entities": entities,
            "total_relations": relations,
            "entity_types": {t[0]: t[1] for t in types},
            "db_path": self.db_path,
        }

    def _make_entity_id(self, name: str, entity_type: str) -> str:
        return f"ent_{hashlib.sha256(f'{name}:{entity_type}'.encode()).hexdigest()[:12]}"

    def _make_relation_id(self, source: str, target: str, rel_type: str) -> str:
        return f"rel_{hashlib.sha256(f'{source}:{target}:{rel_type}'.encode()).hexdigest()[:12]}"
