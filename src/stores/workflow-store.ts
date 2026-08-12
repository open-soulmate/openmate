import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";

export type WorkflowNodeType =
  | "start"
  | "llm"
  | "tool"
  | "condition"
  | "loop"
  | "code"
  | "knowledge"
  | "end";

export interface WorkflowNodeData {
  label: string;
  type: WorkflowNodeType;
  description?: string;
  // LLM
  model?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Tool
  toolName?: string;
  toolParams?: Record<string, string>;
  // Condition
  condition?: string;
  // Code
  code?: string;
  language?: string;
  // Knowledge
  knowledgeBaseId?: string;
  topK?: number;
  // Start
  triggerType?: "manual" | "schedule" | "webhook" | "event";
  triggerConfig?: string;
  // End
  outputMapping?: string;
  // Loop
  listVariable?: string;
  itemVariable?: string;
  // General
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

interface WorkflowState {
  workflows: WorkflowDefinition[];
  activeWorkflowId: string | null;
  activeWorkflow: WorkflowDefinition | null;

  // Active workflow editing state
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  isDirty: boolean;
  debugMode: boolean;
  debugNodeId: string | null;

  // Actions
  setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => void;
  setDirty: (dirty: boolean) => void;
  setDebugMode: (on: boolean) => void;
  setDebugNodeId: (id: string | null) => void;

  // Workflow CRUD
  createWorkflow: (name: string) => string;
  loadWorkflow: (id: string) => void;
  saveWorkflow: () => void;
  deleteWorkflow: (id: string) => void;
  duplicateWorkflow: (id: string) => string | null;
  setActiveWorkflowId: (id: string | null) => void;

  // Import/Export
  exportWorkflow: (id: string) => string | null;
  importWorkflow: (json: string) => string | null;
}

const defaultStartNode: Node<WorkflowNodeData> = {
  id: "start-1",
  type: "startNode",
  position: { x: 250, y: 80 },
  data: { label: "开始", type: "start", triggerType: "manual" },
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  activeWorkflowId: null,
  activeWorkflow: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,
  debugMode: false,
  debugNodeId: null,

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),
  selectNode: (id) => set({ selectedNodeId: id }),
  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    })),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setDebugMode: (on) => set({ debugMode: on, debugNodeId: null }),
  setDebugNodeId: (id) => set({ debugNodeId: id }),

  createWorkflow: (name) => {
    const id = Math.random().toString(36).slice(2, 10);
    const now = Date.now();
    const wf: WorkflowDefinition = {
      id,
      name,
      description: "",
      nodes: [{ ...defaultStartNode, id: "start-1" }],
      edges: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    set((s) => ({
      workflows: [wf, ...s.workflows],
      activeWorkflowId: id,
      activeWorkflow: wf,
      nodes: wf.nodes,
      edges: wf.edges,
      selectedNodeId: null,
      isDirty: false,
    }));
    return id;
  },

  loadWorkflow: (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return;
    set({
      activeWorkflowId: id,
      activeWorkflow: wf,
      nodes: wf.nodes,
      edges: wf.edges,
      selectedNodeId: null,
      isDirty: false,
    });
  },

  saveWorkflow: () => {
    const { activeWorkflowId, nodes, edges } = get();
    if (!activeWorkflowId) return;
    set((s) => ({
      workflows: s.workflows.map((w) =>
        w.id === activeWorkflowId
          ? {
              ...w,
              nodes,
              edges,
              updatedAt: Date.now(),
              version: w.version + 1,
            }
          : w,
      ),
      activeWorkflow: s.workflows.find((w) => w.id === activeWorkflowId)
        ? {
            ...s.workflows.find((w) => w.id === activeWorkflowId)!,
            nodes,
            edges,
            updatedAt: Date.now(),
          }
        : null,
      isDirty: false,
    }));
  },

  deleteWorkflow: (id) =>
    set((s) => {
      const remaining = s.workflows.filter((w) => w.id !== id);
      const wasActive = s.activeWorkflowId === id;
      return {
        workflows: remaining,
        activeWorkflowId: wasActive ? null : s.activeWorkflowId,
        activeWorkflow: wasActive ? null : s.activeWorkflow,
        nodes: wasActive ? [] : s.nodes,
        edges: wasActive ? [] : s.edges,
        selectedNodeId: wasActive ? null : s.selectedNodeId,
        isDirty: false,
      };
    }),

  duplicateWorkflow: (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return null;
    const newId = Math.random().toString(36).slice(2, 10);
    const now = Date.now();
    const dup: WorkflowDefinition = {
      ...wf,
      id: newId,
      name: `${wf.name} (副本)`,
      nodes: structuredClone(wf.nodes),
      edges: structuredClone(wf.edges),
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    set((s) => ({ workflows: [dup, ...s.workflows] }));
    return newId;
  },

  setActiveWorkflowId: (id) => set({ activeWorkflowId: id }),

  exportWorkflow: (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return null;
    return JSON.stringify(wf, null, 2);
  },

  importWorkflow: (json) => {
    try {
      const parsed = JSON.parse(json) as WorkflowDefinition;
      if (!parsed.nodes || !parsed.edges) return null;
      const id = Math.random().toString(36).slice(2, 10);
      const now = Date.now();
      const wf: WorkflowDefinition = {
        ...parsed,
        id,
        name: `${parsed.name || "导入的工作流"} (导入)`,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      set((s) => ({
        workflows: [wf, ...s.workflows],
        activeWorkflowId: id,
        activeWorkflow: wf,
        nodes: wf.nodes,
        edges: wf.edges,
        selectedNodeId: null,
        isDirty: false,
      }));
      return id;
    } catch {
      return null;
    }
  },
}));
