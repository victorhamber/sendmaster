import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftToGraph, graphToDraft } from '../flow-model.js';

test('o grafo guarda a posição e os caminhos sim e não', () => {
  const draft = {
    start: 'a',
    nodes: [
      { id: 'a', kind: 'email', campaignId: 'c1', next: 'b', x: 10, y: 20 },
      { id: 'b', kind: 'condition', when: 'opened', yes: 'c', no: null },
      { id: 'c', kind: 'email', campaignId: 'c2', next: null },
    ],
  };
  const graph = draftToGraph(draft);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges[1].sourceHandle, 'yes');
  graph.nodes[0].position = { x: 30, y: 40 };
  const next = graphToDraft(draft, graph.nodes, graph.edges);
  assert.equal(next.start, 'a');
  assert.equal(next.nodes.find(node => node.id === 'a')?.x, 30);
  assert.equal(next.nodes.find(node => node.id === 'b')?.yes, 'c');
  assert.equal(next.nodes.find(node => node.id === 'b')?.no, null);
});
