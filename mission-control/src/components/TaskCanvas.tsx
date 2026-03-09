'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    EdgeChange,
    NodeChange,
    Node,
    Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface Task {
    id: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    status: 'todo' | 'progress' | 'done';
    canvas_x?: number;
    canvas_y?: number;
    project_color?: string;
}

interface TaskEdge {
    id: string;
    source_id: string;
    target_id: string;
}

interface TaskCanvasProps {
    tasks: Task[];
    taskEdges: TaskEdge[];
    onNodeDragStop: (id: string, x: number, y: number) => void;
    onConnectTasks: (source: string, target: string) => void;
    onDeleteEdge: (edgeId: string) => void;
}

const getPriorityColor = (priority: string) => {
    switch (priority) {
        case 'high': return '#F53A3A';
        case 'medium': return '#F5A623';
        case 'low': return '#3AF5A6';
        default: return '#666';
    }
};

export function TaskCanvas({ tasks, taskEdges, onNodeDragStop, onConnectTasks, onDeleteEdge }: TaskCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Sync external tasks to React Flow nodes
    useEffect(() => {
        const initialNodes: Node[] = tasks.map((task) => ({
            id: task.id,
            position: { x: task.canvas_x || 0, y: task.canvas_y || 0 },
            data: {
                label: (
                    <div style={{ padding: 4 }}>
                        <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: getPriorityColor(task.priority) }} />
                            {task.status.toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: 12 }}>{task.title}</div>
                    </div>
                )
            },
            style: {
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                border: `1px solid ${task.project_color || 'var(--border-color)'}`,
                borderRadius: 8,
                width: 150,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }
        }));
        setNodes(initialNodes);
    }, [tasks, setNodes]);

    // Sync external edges to React Flow edges
    useEffect(() => {
        const initialEdges: Edge[] = taskEdges.map((edge) => ({
            id: edge.id,
            source: edge.source_id,
            target: edge.target_id,
            animated: true,
            style: { stroke: 'var(--brand-purple)', strokeWidth: 2 },
            markerEnd: { type: 'arrowclosed', color: 'var(--brand-purple)' }
        }));
        setEdges(initialEdges);
    }, [taskEdges, setEdges]);

    const onConnect = useCallback(
        (params: Connection) => {
            if (params.source && params.target) {
                // Instantly update UI for snappy feel
                setEdges((eds) => addEdge({
                    ...params,
                    animated: true,
                    style: { stroke: 'var(--brand-purple)', strokeWidth: 2 } as any,
                    markerEnd: { type: 'arrowclosed', color: 'var(--brand-purple)' }
                }, eds) as Edge[]);
                // Call API
                onConnectTasks(params.source, params.target);
            }
        },
        [onConnectTasks, setEdges]
    );

    const onNodeDragStopHandler = useCallback(
        (event: any, node: Node) => {
            onNodeDragStop(node.id, node.position.x, node.position.y);
        },
        [onNodeDragStop]
    );

    const onEdgesDelete = useCallback(
        (edgesToDelete: Edge[]) => {
            for (const edge of edgesToDelete) {
                onDeleteEdge(edge.id);
            }
        },
        [onDeleteEdge]
    );

    return (
        <div style={{ width: '100%', height: '100%', minHeight: 400, background: 'var(--bg-deep)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStopHandler}
                onEdgesDelete={onEdgesDelete}
                fitView
                colorMode="dark"
            >
                <Background color="#333" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
}
