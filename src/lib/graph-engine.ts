// ─── Graph Engine: DAG Orchestration Engine ─────────────────────────────────

// ─── Type Definitions ───────────────────────────────────────────────────────

export type GraphNodeType = "agent" | "condition" | "loop" | "parallel" | "subgraph";
export type GraphExecutionState = "idle" | "running" | "completed" | "failed" | "paused";
export type GraphNodeState = "pending" | "running" | "completed" | "failed" | "skipped";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description?: string;
  /** Agent ID for agent nodes */
  agentId?: string;
  /** Condition expression for condition nodes */
  condition?: string;
  /** Loop config */
  loopConfig?: {
    kind: "for" | "while";
    maxIterations: number;
    condition?: string;
    collection?: string;
  };
  /** Subgraph ID for subgraph nodes */
  subgraphId?: string;
  /** Node-level timeout in ms */
  timeoutMs?: number;
  /** Position on canvas */
  position: { x: number; y: number };
  /** Arbitrary config data */
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Condition expression; if empty/undefined, edge is unconditional */
  condition?: string;
  label?: string;
}

export interface GraphDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Global timeout in ms */
  globalTimeoutMs?: number;
  /** Max execution steps (budget control) */
  maxSteps?: number;
  createdAt: number;
  updatedAt: number;
}

export interface NodeExecutionResult {
  nodeId: string;
  state: GraphNodeState;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  iterations?: number;
}

export interface GraphExecutionResult {
  graphId: string;
  state: GraphExecutionState;
  nodeResults: Map<string, NodeExecutionResult>;
  startedAt: number;
  completedAt?: number;
  totalSteps: number;
  error?: string;
}

// ─── DAG Validation ─────────────────────────────────────────────────────────

export function validateDAG(nodes: GraphNode[], edges: GraphEdge[]): { valid: boolean; error?: string } {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adjacency.get(edge.source);
    if (list) list.push(edge.target);
  }

  // Topological sort to detect cycles
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return false; // cycle detected
    if (visited.has(nodeId)) return true;
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!dfs(neighbor)) return false;
    }
    inStack.delete(nodeId);
    return true;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (!dfs(node.id)) {
        return { valid: false, error: `Cycle detected involving node "${node.label || node.id}"` };
      }
    }
  }

  return { valid: true };
}

/** Get topological order of nodes */
export function topologicalSort(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return order;
}

/** Get direct successors of a node */
export function getSuccessors(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/** Get direct predecessors of a node */
export function getPredecessors(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

// ─── Expression Evaluator (simple condition eval) ───────────────────────────

function evaluateCondition(expr: string, context: Record<string, unknown>): boolean {
  try {
    // Simple expression evaluator: supports ==, !=, >, <, >=, <=, &&, ||, !
    // And variable references like `nodeId.output.field`
    const sanitized = expr.replace(
      /(\w+(?:\.\w+)*)/g,
      (match) => {
        const parts = match.split(".");
        let val: unknown = context;
        for (const part of parts) {
          if (val && typeof val === "object" && part in (val as Record<string, unknown>)) {
            val = (val as Record<string, unknown>)[part];
          } else {
            return "undefined";
          }
        }
        if (typeof val === "string") return JSON.stringify(val);
        if (typeof val === "boolean" || typeof val === "number") return String(val);
        return "undefined";
      },
    );
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${sanitized});`);
    return Boolean(fn());
  } catch {
    return false;
  }
}

// ─── Graph Engine ───────────────────────────────────────────────────────────

export type NodeExecutor = (
  node: GraphNode,
  context: Record<string, unknown>,
) => Promise<{ output: unknown; error?: string }>;

export interface GraphEngineOptions {
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, result: NodeExecutionResult) => void;
  onNodeFail?: (nodeId: string, error: string) => void;
  onStateChange?: (state: GraphExecutionState) => void;
  onStep?: (step: number, nodeId: string) => void;
  /** Custom executor for agent nodes */
  agentExecutor?: NodeExecutor;
  /** Custom executor for subgraph nodes */
  subgraphExecutor?: (subgraphId: string, context: Record<string, unknown>) => Promise<unknown>;
}

export class GraphEngine {
  private definition: GraphDefinition;
  private state: GraphExecutionState = "idle";
  private nodeResults = new Map<string, NodeExecutionResult>();
  private totalSteps = 0;
  private startedAt = 0;
  private abortController: AbortController | null = null;
  private options: GraphEngineOptions;
  private context: Record<string, unknown> = {};

  constructor(definition: GraphDefinition, options: GraphEngineOptions = {}) {
    this.definition = definition;
    this.options = options;
  }

  getState(): GraphExecutionState {
    return this.state;
  }

  getResults(): Map<string, NodeExecutionResult> {
    return new Map(this.nodeResults);
  }

  getProgress(): { completed: number; total: number; running: string[] } {
    const completed = [...this.nodeResults.values()].filter(
      (r) => r.state === "completed" || r.state === "failed" || r.state === "skipped",
    ).length;
    const running = [...this.nodeResults.entries()]
      .filter(([, r]) => r.state === "running")
      .map(([id]) => id);
    return { completed, total: this.definition.nodes.length, running };
  }

  /** Validate and run the entire graph */
  async execute(): Promise<GraphExecutionResult> {
    // Validate
    const validation = validateDAG(this.definition.nodes, this.definition.edges);
    if (!validation.valid) {
      return {
        graphId: this.definition.id,
        state: "failed",
        nodeResults: new Map(),
        startedAt: Date.now(),
        totalSteps: 0,
        error: validation.error,
      };
    }

    this.setState("running");
    this.startedAt = Date.now();
    this.totalSteps = 0;
    this.nodeResults.clear();
    this.context = {};
    this.abortController = new AbortController();

    try {
      await this.executeTopologically();
      this.setState("completed");
    } catch (err: unknown) {
      this.setState("failed");
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        graphId: this.definition.id,
        state: "failed",
        nodeResults: this.nodeResults,
        startedAt: this.startedAt,
        completedAt: Date.now(),
        totalSteps: this.totalSteps,
        error: errorMsg,
      };
    }

    return {
      graphId: this.definition.id,
      state: this.state,
      nodeResults: this.nodeResults,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      totalSteps: this.totalSteps,
    };
  }

  pause(): void {
    if (this.state === "running") {
      this.setState("paused");
    }
  }

  resume(): void {
    if (this.state === "paused") {
      this.setState("running");
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.setState("failed");
  }

  private setState(state: GraphExecutionState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private checkBudget(): void {
    if (this.definition.maxSteps && this.totalSteps >= this.definition.maxSteps) {
      throw new Error(`Budget exceeded: max ${this.definition.maxSteps} steps reached`);
    }
  }

  private checkGlobalTimeout(): void {
    if (this.definition.globalTimeoutMs) {
      const elapsed = Date.now() - this.startedAt;
      if (elapsed > this.definition.globalTimeoutMs) {
        throw new Error(`Global timeout exceeded: ${this.definition.globalTimeoutMs}ms`);
      }
    }
  }

  private checkAborted(): void {
    if (this.abortController?.signal.aborted) {
      throw new Error("Execution aborted");
    }
  }

  private async waitForResume(): Promise<void> {
    while (this.state === "paused") {
      this.checkAborted();
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async executeTopologically(): Promise<void> {
    const order = topologicalSort(this.definition.nodes, this.definition.edges);
    const nodeMap = new Map(this.definition.nodes.map((n) => [n.id, n]));

    // Group by execution level (nodes at the same level can run in parallel)
    const levels = this.computeExecutionLevels(order);

    for (const level of levels) {
      this.checkAborted();
      this.checkGlobalTimeout();

      // Check if all predecessors of nodes in this level have completed
      const promises: Promise<void>[] = [];
      for (const nodeId of level) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        // Check if predecessors allow this node to run
        const predecessors = getPredecessors(nodeId, this.definition.edges);
        const allPredecessorsDone = predecessors.every((predId) => {
          const result = this.nodeResults.get(predId);
          return result && (result.state === "completed" || result.state === "skipped");
        });

        if (!allPredecessorsDone && predecessors.length > 0) {
          // Check if any predecessor failed - skip this node
          const anyFailed = predecessors.some((predId) => {
            const result = this.nodeResults.get(predId);
            return result?.state === "failed";
          });
          if (anyFailed) {
            this.nodeResults.set(nodeId, {
              nodeId,
              state: "skipped",
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
            continue;
          }
          // Some predecessor was skipped
          const anySkipped = predecessors.some((predId) => {
            const result = this.nodeResults.get(predId);
            return result?.state === "skipped";
          });
          if (anySkipped) {
            // Check conditional edges - if the condition requires this predecessor, skip
            const incomingEdges = this.definition.edges.filter((e) => e.target === nodeId);
            const hasConditional = incomingEdges.some((e) => e.condition);
            if (hasConditional) {
              // At least one conditional path led here; still try to run
            } else {
              this.nodeResults.set(nodeId, {
                nodeId,
                state: "skipped",
                startedAt: Date.now(),
                completedAt: Date.now(),
              });
              continue;
            }
          }
        }

        promises.push(this.executeNode(node));
      }

      await Promise.all(promises);
    }
  }

  private computeExecutionLevels(order: string[]): string[][] {
    const levels: string[][] = [];
    const assigned = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const edge of this.definition.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      adjacency.get(edge.source)!.push(edge.target);
    }

    while (assigned.size < order.length) {
      const currentLevel: string[] = [];
      for (const nodeId of order) {
        if (assigned.has(nodeId)) continue;
        const predecessors = getPredecessors(nodeId, this.definition.edges);
        if (predecessors.every((p) => assigned.has(p))) {
          currentLevel.push(nodeId);
        }
      }
      if (currentLevel.length === 0) break; // shouldn't happen if DAG is valid
      for (const id of currentLevel) assigned.add(id);
      levels.push(currentLevel);
    }

    return levels;
  }

  private async executeNode(node: GraphNode): Promise<void> {
    await this.waitForResume();
    this.checkBudget();
    this.checkGlobalTimeout();
    this.checkAborted();

    this.totalSteps++;
    this.options.onStep?.(this.totalSteps, node.id);

    const result: NodeExecutionResult = {
      nodeId: node.id,
      state: "running",
      startedAt: Date.now(),
    };
    this.nodeResults.set(node.id, result);
    this.options.onNodeStart?.(node.id);

    try {
      const output = await this.executeNodeByType(node);
      result.state = "completed";
      result.output = output;
      result.completedAt = Date.now();
      this.context[`${node.id}.output`] = output;
      this.options.onNodeComplete?.(node.id, result);
    } catch (err: unknown) {
      result.state = "failed";
      result.error = err instanceof Error ? err.message : String(err);
      result.completedAt = Date.now();
      this.options.onNodeFail?.(node.id, result.error);
    }
  }

  private async executeNodeByType(node: GraphNode): Promise<unknown> {
    // Node-level timeout
    const timeoutMs = node.timeoutMs ?? 30000;

    const executeWithTimeout = async (): Promise<unknown> => {
      switch (node.type) {
        case "agent":
          return this.executeAgentNode(node);
        case "condition":
          return this.executeConditionNode(node);
        case "loop":
          return this.executeLoopNode(node);
        case "parallel":
          return this.executeParallelNode(node);
        case "subgraph":
          return this.executeSubgraphNode(node);
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
    };

    return Promise.race([
      executeWithTimeout(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Node "${node.label}" timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private async executeAgentNode(node: GraphNode): Promise<unknown> {
    if (this.options.agentExecutor) {
      const result = await this.options.agentExecutor(node, this.context);
      if (result.error) throw new Error(result.error);
      return result.output;
    }
    // Default: simulate agent execution
    return { agentId: node.agentId, message: "Agent executed (no custom executor provided)" };
  }

  private executeConditionNode(node: GraphNode): { branch: "true" | "false"; value: boolean } {
    const condition = node.condition ?? "true";
    const result = evaluateCondition(condition, this.context);
    // Mark edges based on condition result
    const trueEdges = this.definition.edges.filter(
      (e) => e.source === node.id && (!e.condition || e.condition === "true"),
    );
    const falseEdges = this.definition.edges.filter(
      (e) => e.source === node.id && e.condition === "false",
    );

    // Skip edges that don't match the branch
    for (const edge of result ? falseEdges : trueEdges) {
      const targetResult = this.nodeResults.get(edge.target);
      if (!targetResult || targetResult.state === "pending") {
        this.nodeResults.set(edge.target, {
          nodeId: edge.target,
          state: "skipped",
          startedAt: Date.now(),
          completedAt: Date.now(),
        });
      }
    }

    return { branch: result ? "true" : "false", value: result };
  }

  private async executeLoopNode(node: GraphNode): Promise<{ iterations: number; results: unknown[] }> {
    const config = node.loopConfig;
    if (!config) throw new Error("Loop node missing loopConfig");

    const results: unknown[] = [];
    const maxIter = config.maxIterations;

    if (config.kind === "for") {
      // Iterate over a collection from context
      const collection = (this.context[config.collection ?? ""] as unknown[]) ?? [];
      for (let i = 0; i < Math.min(collection.length, maxIter); i++) {
        this.checkBudget();
        this.checkGlobalTimeout();
        this.checkAborted();
        this.totalSteps++;
        this.context[`${node.id}.index`] = i;
        this.context[`${node.id}.item`] = collection[i];
        results.push(collection[i]);
      }
    } else {
      // while loop
      for (let i = 0; i < maxIter; i++) {
        this.checkBudget();
        this.checkGlobalTimeout();
        this.checkAborted();
        this.totalSteps++;
        const shouldContinue = config.condition
          ? evaluateCondition(config.condition, this.context)
          : true;
        if (!shouldContinue) break;
        results.push(i);
      }
    }

    return { iterations: results.length, results };
  }

  private async executeParallelNode(node: GraphNode): Promise<unknown[]> {
    // Execute all outgoing edge targets in parallel
    const successors = getSuccessors(node.id, this.definition.edges);
    if (successors.length === 0) return [];

    const nodeMap = new Map(this.definition.nodes.map((n) => [n.id, n]));
    const promises = successors.map(async (targetId) => {
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) return null;
      try {
        return await this.executeNodeByType(targetNode);
      } catch {
        return null;
      }
    });

    return Promise.all(promises);
  }

  private async executeSubgraphNode(node: GraphNode): Promise<unknown> {
    if (!node.subgraphId) throw new Error("Subgraph node missing subgraphId");
    if (this.options.subgraphExecutor) {
      return this.options.subgraphExecutor(node.subgraphId, this.context);
    }
    return { subgraphId: node.subgraphId, message: "Subgraph executed (no custom executor provided)" };
  }
}

// ─── Utility: Generate unique IDs ───────────────────────────────────────────

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Default Graph Templates ────────────────────────────────────────────────

export function createEmptyGraph(): GraphDefinition {
  return {
    id: generateId(),
    name: "Untitled Graph",
    description: "",
    nodes: [],
    edges: [],
    globalTimeoutMs: 300000, // 5 min
    maxSteps: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
