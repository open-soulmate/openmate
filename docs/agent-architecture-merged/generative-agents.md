# Generative Agents

## 概述

Generative Agents 是一个生成式Agent仿真。

**仓库**: https://github.com/joonspk-research/generative_agents | **语言**: Python

## 核心架构

系统采用 **前后端分离** 的双服务器架构：

- **环境前端服务器**（Django Web Server）：基于 Phaser.js 的2D精灵游戏引擎，渲染Smallville地图，处理代理的视觉移动和交互
- **仿真后端服务器**（ReverieServer）：核心决策引擎，管理所有代理的状态、认知循环和世界时钟

核心类 `ReverieServer` 的职责：
[详见源码]

当代理需要决策时，必须从可能包含数千条记录的记忆流中检索最相关的记忆。系统使用 **三维加权评分**：

[详见源码]

规划输入：代理的身份描述 + 前一天经历的摘要。规划也存储在记忆流中，可被检索和修正。

**反应式重规划**：代理持续感知环境，当观察到有意义的事件时，LLM判断是否需要偏离当前计划并重新规划。

环境由 `Maze` 类管理，地图以 **Tile网格** 表示：

每个Tile包含：
- `world`：所属世界名
- `sector`：所属区域
- `arena`：所属场所
- `game_object`：该格子上的游戏对象
- `events`：当前在该格子上的事件集合
- `collision`：是否可通行

代理移动使用 `path_finder.py` 中的寻路算法，碰撞检测基于 `collision_block_id`（值为"32125"）。代理到达目的地时，对象的动作事件会被激活（如"使用微波炉"），离开时恢复为默认空闲状态。

[详见源码]

## 关键技术

记忆流是代理架构的基石，存储代理的全部生活经历。每条记忆对象包含：
- **文本内容**：自然语言描述的事件/思维/对话
- **创建时间**：事件发生时刻
- **最后访问时间**：最近一次被检索的时刻
- **重要性评分**：由LLM评定的1-10分
- **嵌入向量**：用于相似度检索

三种记忆类型：
| 类型 | 说明 | 代码标识 |
|------|------|----------|
| **观察（Observation）** | 代理直接感知的事件 | `a_mem.get_str_seq_events()` |
| **思维（Thought）** | 反思生成的高层洞察 | `a_mem.get_str_seq_thoughts()` |
| **对话（Chat）** | 与其他代理的交流 | `a_mem.get_str_seq_chats()` |

当代理需要决策时，必须从可能包含数千条记录的记忆流中检索最相关的记忆。系统使用 **三维加权评分**：

[详见源码]
世界 (world)
  └── 区域 (sector)
       └── 场所 (arena)
            └── 游戏对象 (game_object)
```

代码实现中，空间记忆通过 `s_mem` 字典维护：
```python
s_mem = {
  "the Ville": {
    "Hobbs Cafe": {
      "cafe": ["cooking area", "counter", "refrigerator"],
      "kitchen": ["stove", "sink"]
    }
  }
}
```

`start_path_tester_server()` 方法通过代理的 **视觉半径**（默认8格）逐步扫描环境，构建空间记忆。代理通过空间记忆在被问及"去哪做X"时，能检索合适的地点。

1. **记忆流 + 三维检索**：解决了LLM上下文窗口有限的问题，让代理能从海量经历中检索最相关的记忆
2. **反思机制**：实现了代理的"元认知"，从具体事件中抽象出高层洞察
3. **递归规划**：从日到小时到分钟的多粒度计划分解，确保行为一致性
4. **反应式重规划**：代理能在保持计划的同时响应环境变化
5. **涌现行为**：25个代理的长期交互产生了信息传播、社会关系、协调活动等未被显式编程的行为

## 对openmate的启示

> 仓库: https://github.com/joonspk-research/generative-agents  
> 实际成功路径: `joonspk-research/generative_agents`（**下划线**，非连字符）  
> 抓取通道: cdn.jsdelivr.net/gh/joonspk-research/generative_agents@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供记忆流 / 双服务器仿真 / fork 恢复 / 历史加载 借鉴

---

| 需求 | Generative Agents 机制 | 可复用度 |
|------|------------------------|----------|
| Fork 恢复 | forked simulation 名 + fin | **高** |
| 历史 CSV 预载 | call -- load history | **高** |
| 双服务器分离 | Django + reverie | **高** |
| 步进 CLI | run N / exit / fin | **高** |
| 时间换算 | 1 step = 10s | 中 |
| replay vs demo | 调试回放 vs 压缩演示 | **高** |
| storage 分离 | storage / compressed / temp | **高** |
| utils.py 集中配置 | key + 路径 + collision_id | 高 |
| 基础仿真模板 | n25 / n3 | 中 |
| Tiled 地图编辑 | 扩容 agent | 低 |
| API 限流 hang | 勤保存 | **P0 警示** |

---

[详见源码]

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（93-generative-agents.md）
- MiMo报告（generative-agents-l1.md）
- MiMo卡片（generative-agents.md）
