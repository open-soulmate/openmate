"""AgentCore v1.0 智能体生命周期 — plan->execute->reflect->iterate。"""
from __future__ import annotations
import time, uuid
from dataclasses import dataclass, field
from enum import Enum

class AgentType(str, Enum):
    """智能体类型。"""
    PLANNER = "planner"    # 规划型：负责任务拆解
    EXECUTOR = "executor"  # 执行型：负责具体执行
    REVIEWER = "reviewer"  # 审查型：负责质量审查

class AgentState(str, Enum):
    """智能体运行状态。"""
    IDLE = "idle"
    PLANNING = "planning"
    EXECUTING = "executing"
    REFLECTING = "reflecting"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class AgentStep:
    """执行步骤。"""
    step_id: str
    phase: str  # plan/execute/reflect/iterate
    input_data: dict = field(default_factory=dict)
    output_data: dict = field(default_factory=dict)
    duration_ms: float = 0
    timestamp: float = field(default_factory=time.time)

@dataclass
class AgentInstance:
    """智能体实例。"""
    agent_id: str
    agent_type: AgentType
    state: AgentState = AgentState.IDLE
    steps: list[AgentStep] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

class AgentLifecycle:
    """智能体生命周期管理（单例）。"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._agents: dict[str, AgentInstance] = {}
        return cls._instance

    def create_agent(self, agent_type: AgentType) -> AgentInstance:
        """创建智能体。"""
        agent = AgentInstance(agent_id=f"agent-{uuid.uuid4().hex[:8]}", agent_type=agent_type)
        self._agents[agent.agent_id] = agent
        return agent

    def step(self, agent_id: str, phase: str, input_data: dict = None) -> AgentStep:
        """执行一个生命周期步骤。"""
        agent = self._agents.get(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        state_map = {"plan": AgentState.PLANNING, "execute": AgentState.EXECUTING, "reflect": AgentState.REFLECTING}
        agent.state = state_map.get(phase, agent.state)
        start = time.time()
        step = AgentStep(step_id=f"step-{uuid.uuid4().hex[:8]}", phase=phase, input_data=input_data or {})
        step.duration_ms = (time.time() - start) * 1000
        agent.steps.append(step)
        return step

    def full_cycle(self, agent_id: str, task_data: dict) -> list[AgentStep]:
        """执行完整plan->execute->reflect循环。"""
        results = []
        results.append(self.step(agent_id, "plan", task_data))
        results.append(self.step(agent_id, "execute", results[-1].output_data))
        results.append(self.step(agent_id, "reflect", results[-1].output_data))
        agent = self._agents.get(agent_id)
        if agent:
            agent.state = AgentState.COMPLETED
        return results

    def get_agent(self, agent_id: str) -> AgentInstance | None:
        """获取智能体。"""
        return self._agents.get(agent_id)

    def list_agents(self, agent_type: AgentType = None) -> list[AgentInstance]:
        """列出智能体。"""
        agents = list(self._agents.values())
        if agent_type:
            agents = [a for a in agents if a.agent_type == agent_type]
        return agents
