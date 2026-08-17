"use client";

import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore, type WorkflowNodeData } from "@/stores/workflow-store";
import { nodeTypes } from "./nodes/workflow-nodes";
import { NodePalette } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { WorkflowToolbar } from "./workflow-toolbar";
import { WorkflowListPanel } from "./workflow-list-panel";
import { WorkflowExecutionPanel } from "./workflow-execution-panel";
import { useTranslation } from 'react-i18next';


const defaultNodes: Node<WorkflowNodeData>[] = [
  {
    id: "start-1",
    type: "startNode",
    position: { x: 400, y: 80 },
    data: { label: t('workflow-builder.t26433'), type: "start", triggerType: "manual" },
  },
];

export function WorkflowBuilderClient() {
  const { t } = useTranslation();
  const storeNodes = useWorkflowStore((s) => s.nodes);
  const storeEdges = useWorkflowStore((s) => s.edges);
  const setStoreNodes = useWorkflowStore((s) => s.setNodes);
  const setStoreEdges = useWorkflowStore((s) => s.setEdges);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const debugNodeId = useWorkflowStore((s) => s.debugNodeId);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const showExecutionPanel = useWorkflowStore((s) => s.showExecutionPanel);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    storeNodes.length > 0 ? storeNodes : defaultNodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const [showList, setShowList] = useState(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // Sync local state back to store on change
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Defer read of latest nodes
      setTimeout(() => {
        setStoreNodes(
          // @ts-expect-error -- ReactFlow node types differ slightly
          reactFlowInstance.current?.getNodes() ?? [],
        );
      }, 0);
    },
    [onNodesChange, setStoreNodes],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setTimeout(() => {
        setStoreEdges(
          reactFlowInstance.current?.getEdges() ?? [],
        );
      }, 0);
    },
    [onEdgesChange, setStoreEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdges = addEdge({ ...params, animated: true }, edges);
      setEdges(newEdges);
      setStoreEdges(newEdges);
    },
    [edges, setEdges, setStoreEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  // Drag-and-drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const type = e.dataTransfer.getData("application/reactflow-type");
      const dataType = e.dataTransfer.getData("application/reactflow-data-type") as WorkflowNodeData["type"];
      const label = e.dataTransfer.getData("application/reactflow-label");

      if (!type || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode: Node<WorkflowNodeData> = {
        id: `${dataType}-${Date.now()}`,
        type,
        position,
        data: { label, type: dataType },
      };

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setStoreNodes(newNodes);
    },
    [nodes, setNodes, setStoreNodes],
  );

  // Load workflow nodes/edges when switching
  const handleLoadWorkflow = useCallback(
    (wfNodes: Node<WorkflowNodeData>[], wfEdges: Edge[]) => {
      setNodes(wfNodes.length > 0 ? wfNodes : defaultNodes);
      setEdges(wfEdges);
      setStoreNodes(wfNodes.length > 0 ? wfNodes : defaultNodes);
      setStoreEdges(wfEdges);
    },
    [setNodes, setEdges, setStoreNodes, setStoreEdges],
  );

  const handleCreateNew = useCallback(() => {
    const id = useWorkflowStore.getState().createWorkflow(t('will.newWorkflow'));
    if (id) {
      const wf = useWorkflowStore.getState().workflows.find((w) => w.id === id);
      if (wf) {
        setNodes(wf.nodes);
        setEdges(wf.edges);
      }
    }
  }, [setNodes, setEdges]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  return (
    <div className="flex h-full flex-col">
      <WorkflowToolbar onCreateNew={handleCreateNew} />
      <div className="flex flex-1 overflow-hidden">
        {showList && <WorkflowListPanel onLoad={handleLoadWorkflow} />}
        <NodePalette />
        <div className="relative flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              selected: n.id === selectedNodeId,
              data: {
                ...n.data,
                debugActive: n.id === debugNodeId,
              },
            }))}
            edges={edges.map((e) => ({
              ...e,
              style: { strokeWidth: 1.5, stroke: "hsl(var(--border))" },
            }))}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={onInit as never}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ animated: true }}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--border))" />
            <Controls
              position="bottom-left"
              className="!rounded-lg !border !border-border !bg-card !shadow-sm"
            />
            <MiniMap
              position="bottom-right"
              nodeStrokeWidth={2}
              zoomable
              pannable
              className="!rounded-lg !border !border-border !bg-card"
            />
          </ReactFlow>

          {/* Empty state */}
          {!activeWorkflowId && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="mb-3 text-4xl opacity-20">⚡</div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('workflow-builder.t37840')}
                <p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('workflow-builder.t88657')}
                <p>
              </div>
            </div>
          )}
        </div>

        {selectedNode && (
          <NodeConfigPanel
            nodeId={selectedNode.id}
            data={selectedNode.data as unknown as WorkflowNodeData}
            onClose={() => selectNode(null)}
          />
        )}
      </div>

      {/* Execution Panel */}
      {showExecutionPanel && <WorkflowExecutionPanel />}
    </div>
  );
}
