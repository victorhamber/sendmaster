import { createRoot } from 'react-dom/client';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { draftToGraph, graphToDraft } from './flow-model.js';

const FlowApi = createContext(null);
let flowRoot;

function EmailNode({ id, data }) {
  const api = useContext(FlowApi);
  return <div className="sm-node"><Handle type="target" position={Position.Left} /><header><strong>E-mail</strong></header><select className="nodrag" value={data.campaignId || ''} onChange={event => api.update(id, { campaignId: event.target.value })}><option value="">Escolha a campanha</option>{api.campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><Handle type="source" position={Position.Right} id="next" /></div>;
}

function WaitNode({ id, data }) {
  const api = useContext(FlowApi);
  return <div className="sm-node"><Handle type="target" position={Position.Left} /><header><strong>Espera</strong></header><input className="nodrag" type="number" min="1" max="8760" value={data.hours || 24} aria-label="Horas de espera" onChange={event => api.update(id, { hours: Number(event.target.value) })} /><Handle type="source" position={Position.Right} id="next" /></div>;
}

function ConditionNode({ id, data }) {
  const api = useContext(FlowApi);
  return <div className="sm-node"><Handle type="target" position={Position.Left} /><header><strong>Condição</strong></header><select className="nodrag" value={data.when || 'opened'} onChange={event => api.update(id, { when: event.target.value })}><option value="opened">Se abriu</option><option value="not_opened">Se não abriu</option><option value="clicked">Se clicou</option><option value="not_clicked">Se não clicou</option></select><span className="sm-yes">Sim</span><span className="sm-no">Não</span><Handle type="source" position={Position.Right} id="yes" style={{ top: 42 }} /><Handle type="source" position={Position.Right} id="no" style={{ top: 74, background: '#e07a72' }} /></div>;
}

const nodeTypes = { email: EmailNode, wait: WaitNode, condition: ConditionNode };

function edgeStyle(handle) {
  return { stroke: handle === 'no' ? '#e07a72' : '#3dce8a' };
}

function Canvas({ api }) {
  const initial = useMemo(() => draftToGraph(api.getDraft()), [api]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges.map(edge => ({ ...edge, style: edgeStyle(edge.sourceHandle) })));
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => { api.setDraft(graphToDraft(api.getDraft(), nodes, edges)); }, [api, nodes, edges]);
  const update = (id, patch) => setNodes(current => current.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node));
  return <FlowApi.Provider value={{ update, campaigns: api.getCampaigns() }}><ReactFlow
    nodes={nodes}
    edges={edges}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    nodeTypes={nodeTypes}
    colorMode="dark"
    fitView
    deleteKeyCode={['Backspace', 'Delete']}
    onBeforeDelete={({ nodes: doomed }) => nodes.filter(node => node.type === 'email' && !doomed.some(item => item.id === node.id)).length > 0}
    onConnect={connection => setEdges(current => current.filter(edge => !(edge.source === connection.source && edge.sourceHandle === connection.sourceHandle)).concat({ ...connection, id: `${connection.source}-${connection.sourceHandle || 'next'}`, style: edgeStyle(connection.sourceHandle) }))}
    onDrop={event => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('text/plain');
      if (!['email', 'wait', 'condition'].includes(kind) || nodes.length >= 12) return;
      setNodes(current => current.concat({ id: `s${Math.random().toString(36).slice(2, 8)}`, type: kind, position: screenToFlowPosition({ x: event.clientX, y: event.clientY }), data: { campaignId: '', hours: 24, when: 'opened' } }));
    }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
  ><Background /><Controls /></ReactFlow></FlowApi.Provider>;
}

window.mountSendmasterFlow = (element, api) => {
  flowRoot?.unmount();
  flowRoot = createRoot(element);
  flowRoot.render(<ReactFlowProvider><div className="flow-react"><Canvas api={api} /></div></ReactFlowProvider>);
};
