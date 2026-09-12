# OpenMate 双实例滚动进化架构

```mermaid
sequenceDiagram
    participant User as 用户浏览器
    participant GW as 网关 (8091)
    participant A as 实例A (8092)<br/>strand_a conservative
    participant B as 实例B (8095)<br/>strand_b aggressive
    participant Git as Git仓库<br/>(共享存储)
    participant Store as 共享存储<br/>(会话/知识库)

    Note over GW,Store: 正常服务阶段
    User->>GW: 对话请求
    GW->>A: 转发到健康实例A
    A->>Store: 读写会话
    A-->>User: 响应

    Note over GW,Store: 触发进化（实例B）
    GW->>B: 标记B为"进化中-不可调度"
    GW-->>User: 新请求全部转A

    B->>Git: 读取源码 + CodeMap
    B->>B: 生成diff补丁
    B->>B: 沙箱验证(编译+测试)
    
    alt 沙箱验证通过
        B->>Git: git commit 补丁
        B->>B: 退出(restart code 42)
        GW->>GW: 健康检查发现B离线<br/>流量全部转A
        B->>B: supervisor重启B<br/>加载新代码
        GW->>B: 健康检查通过<br/>标记B为可用
    else 沙箱验证失败
        B->>B: 回滚补丁，放弃本次进化
        GW->>B: 标记B为可用
    end

    Note over GW,Store: 下一轮进化（切换到实例A）
    GW->>A: 标记A为"进化中-不可调度"
    GW-->>User: 新请求全部转B
    A->>Git: 读取源码 + CodeMap
    A->>A: 生成diff补丁 + 沙箱验证
    A->>Git: git commit
    A->>A: 退出(restart code 42)
    GW->>A: 重启完成后重新加入集群

    Note over GW,Store: 循环交替，永不停机
```

```mermaid
graph TB
    subgraph 用户层
        Browser[浏览器/微信]
    end

    subgraph 网关层
        GW[健康感知网关 :8091]
        HC[健康检查器<br/>每3秒ping]
    end

    subgraph 实例A :8092
        A_Fast[FastAPI服务]
        A_Evo[进化Strand A<br/>conservative]
        A_Watcher[文件变更监控]
    end

    subgraph 实例B :8095
        B_Fast[FastAPI服务]
        B_Evo[进化Strand B<br/>aggressive]
        B_Watcher[文件变更监控]
    end

    subgraph 共享存储
        Git[Git仓库<br/>源码版本控制]
        Sessions[(会话数据库)]
        Knowledge[(知识库)]
        Config[配置文件]
    end

    subgraph 沙箱验证
        Compile[编译检查]
        Tests[单元测试]
        Syntax[语法校验]
    end

    Browser --> GW
    GW --> HC
    HC -->|健康| A_Fast
    HC -->|健康| B_Fast
    HC -->|不健康| 跳过

    A_Fast --> Sessions
    A_Fast --> Knowledge
    B_Fast --> Sessions
    B_Fast --> Knowledge

    A_Evo --> Git
    A_Evo --> Compile
    A_Evo --> Tests
    A_Evo --> Syntax
    A_Evo -->|验证通过| Git
    A_Evo -->|退出42| A_Watcher

    B_Evo --> Git
    B_Evo --> Compile
    B_Evo --> Tests
    B_Evo --> Syntax
    B_Evo -->|验证通过| Git
    B_Evo -->|退出42| B_Watcher

    Git -->|变更信号| A_Watcher
    Git -->|变更信号| B_Watcher

    style GW fill:#4CAF50,color:#fff
    style A_Evo fill:#2196F3,color:#fff
    style B_Evo fill:#FF9800,color:#fff
    style Git fill:#9C27B0,color:#fff
    style Compile fill:#F44336,color:#fff
    style Tests fill:#F44336,color:#fff
```

## 关键机制

### 1. 流量摘除
进化前，网关标记目标实例为"不可调度"，所有新请求路由到另一个实例。

### 2. 沙箱预校验
代码修改后，先在本地跑：语法检查 → 编译检查 → 单元测试。全部通过才git commit并重启。

### 3. 进化并发锁
全局文件锁 `data/evolution.lock`，同时只允许一个实例执行进化任务。

### 4. Git回滚
每次进化一个commit。重启后健康检查失败 → `git reset --hard HEAD~1` → 再次启动。

### 5. 共享存储
会话、知识库、配置不绑定实例本地磁盘，重启不丢数据。
