// Converte a sequência salva no grafo do React Flow e de volta.

export function draftToGraph(draft) {
  const nodes = draft.nodes.map((node, index) => ({
    id: node.id,
    type: node.kind,
    position: {
      x: Number.isInteger(node.x) ? node.x : 80,
      y: Number.isInteger(node.y) ? node.y : 80 + index * 140,
    },
    data: {
      campaignId: node.campaignId || '',
      hours: node.hours || 24,
      when: node.when || 'opened',
    },
  }));
  const edges = [];
  for (const node of draft.nodes) {
    const links = node.kind === 'condition' ? [['yes', node.yes], ['no', node.no]] : [['next', node.next]];
    for (const [handle, target] of links) {
      if (target) edges.push({ id: `${node.id}-${handle}`, source: node.id, target, sourceHandle: handle });
    }
  }
  return { nodes, edges };
}

function blank(node) {
  const base = { id: node.id, x: 0, y: 0 };
  if (node.type === 'wait') return { ...base, kind: 'wait', hours: 24, next: null };
  if (node.type === 'condition') return { ...base, kind: 'condition', when: 'opened', yes: null, no: null };
  return { ...base, kind: 'email', campaignId: '', next: null };
}

export function graphToDraft(draft, nodes, edges) {
  const kept = new Map(nodes.map(node => [node.id, blank(node)]));
  for (const node of nodes) {
    const current = kept.get(node.id);
    current.x = Math.max(0, Math.min(4000, Math.round(node.position?.x || 0)));
    current.y = Math.max(0, Math.min(4000, Math.round(node.position?.y || 0)));
    if (current.kind === 'email') current.campaignId = String(node.data?.campaignId || '');
    if (current.kind === 'wait') current.hours = Math.max(1, Math.min(8760, Math.round(Number(node.data?.hours) || 24)));
    if (current.kind === 'condition') current.when = ['opened', 'not_opened', 'clicked', 'not_clicked'].includes(node.data?.when) ? node.data.when : 'opened';
  }
  for (const edge of edges) {
    const source = kept.get(edge.source);
    if (!source || !kept.has(edge.target)) continue;
    const handle = edge.sourceHandle || 'next';
    if (source.kind === 'condition' && (handle === 'yes' || handle === 'no')) source[handle] = edge.target;
    if (source.kind !== 'condition' && handle === 'next') source.next = edge.target;
  }
  const list = [...kept.values()];
  const start = list.some(node => node.id === draft.start && node.kind === 'email')
    ? draft.start
    : list.find(node => node.kind === 'email')?.id || draft.start;
  return { start, nodes: list };
}
