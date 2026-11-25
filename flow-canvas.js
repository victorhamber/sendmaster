// Quadro de automação. Liga e-mail, espera e condição. Não envia.
let flowLink = null;
let flowZoom = 1;
let flowPan = { x: 0, y: 0 };

function placeFlowNodes() {
  const seen = new Set();
  const walk = (id, x, y) => {
    if (!id || seen.has(id)) return;
    const node = sequenceDraft.nodes.find(item => item.id === id);
    if (!node) return;
    seen.add(id);
    if (!Number.isInteger(node.x)) node.x = x;
    if (!Number.isInteger(node.y)) node.y = y;
    if (node.kind === 'condition') {
      walk(node.yes, node.x + 300, node.y - 100);
      walk(node.no, node.x + 300, node.y + 120);
    } else walk(node.next, node.x + 300, node.y);
  };
  walk(sequenceDraft.start, 48, 180);
  sequenceDraft.nodes.forEach((node, index) => {
    if (!Number.isInteger(node.x)) node.x = 48;
    if (!Number.isInteger(node.y)) node.y = 48 + index * 150;
  });
}

function flowCurve(x1, y1, x2, y2) {
  const bend = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function flowWires() {
  const paths = [];
  for (const node of sequenceDraft.nodes) {
    const outs = node.kind === 'condition' ? [['yes', node.yes, 44], ['no', node.no, 78]] : [['next', node.next, 58]];
    for (const [port, targetId, dy] of outs) {
      const target = sequenceDraft.nodes.find(item => item.id === targetId);
      if (!target) continue;
      const color = port === 'no' ? '#e07a72' : '#3dce8a';
      paths.push(`<path d="${flowCurve(node.x + 240, node.y + dy, target.x, target.y + 58)}" fill="none" stroke="${color}" stroke-width="2"/>`);
    }
  }
  return `<svg class="flow-wires" width="1800" height="980" aria-hidden="true">${paths.join('')}</svg>`;
}

function addFlowNode(kind, x, y) {
  if (sequenceDraft.nodes.length >= 12) return;
  const id = `s${Math.random().toString(36).slice(2, 8)}`;
  const node = kind === 'wait'
    ? { id, kind, hours: 24, next: null, x, y }
    : kind === 'condition'
      ? { id, kind, when: 'opened', yes: null, no: null, x, y }
      : { id, kind: 'email', campaignId: '', next: null, x, y };
  sequenceDraft.nodes.push(node);
  if (!sequenceDraft.nodes.some(item => item.id === sequenceDraft.start && item.kind === 'email')) sequenceDraft.start = id;
  paintFlow();
}

function removeFlowNode(id) {
  const emails = sequenceDraft.nodes.filter(node => node.kind === 'email');
  if (emails.length === 1 && emails[0].id === id) return;
  sequenceDraft.nodes = sequenceDraft.nodes.filter(node => node.id !== id);
  for (const node of sequenceDraft.nodes) {
    if (node.next === id) node.next = null;
    if (node.yes === id) node.yes = null;
    if (node.no === id) node.no = null;
  }
  if (sequenceDraft.start === id) sequenceDraft.start = sequenceDraft.nodes.find(node => node.kind === 'email').id;
  paintFlow();
}

function reaches(fromId, targetId) {
  const seen = new Set();
  const walk = id => {
    if (!id || seen.has(id)) return false;
    if (id === targetId) return true;
    seen.add(id);
    const node = sequenceDraft.nodes.find(item => item.id === id);
    return Boolean(node && (walk(node.next) || walk(node.yes) || walk(node.no)));
  };
  return walk(fromId);
}

function paintFlow() {
  const world = document.querySelector('#flow-world');
  if (!world) return;
  placeFlowNodes();
  const options = sequenceCampaigns.map(campaign => `<option value="${escapeText(campaign.id)}">${escapeText(campaign.name)}</option>`).join('');
  world.innerHTML = `${flowWires()}${sequenceDraft.nodes.map(node => {
    const start = node.id === sequenceDraft.start ? '<i>Início</i>' : '';
    let body = '';
    if (node.kind === 'email') body = `<select data-flow-email="${node.id}"><option value="">Escolha a campanha</option>${options}</select>`;
    else if (node.kind === 'wait') body = `<input data-flow-wait="${node.id}" type="number" min="1" max="8760" value="${node.hours}" aria-label="Horas de espera">`;
    else body = `<select data-flow-when="${node.id}"><option value="opened">Se abriu o e-mail anterior</option><option value="not_opened">Se não abriu</option><option value="clicked">Se clicou</option><option value="not_clicked">Se não clicou</option></select><div class="flow-port-labels"><span>Sim</span><span>Não</span></div>`;
    const outs = node.kind === 'condition'
      ? '<button type="button" class="flow-port out yes" data-out="yes" aria-label="Ligar caminho sim"></button><button type="button" class="flow-port out no" data-out="no" aria-label="Ligar caminho não"></button>'
      : '<button type="button" class="flow-port out" data-out="next" aria-label="Ligar próximo bloco"></button>';
    return `<article class="flow-node${flowLink?.id === node.id ? ' linking' : ''}" data-node="${node.id}" style="left:${node.x}px;top:${node.y}px"><header data-flow-drag><strong>${node.kind === 'email' ? 'E-mail' : node.kind === 'wait' ? 'Espera' : 'Condição'}</strong>${start}<button type="button" data-flow-remove="${node.id}" aria-label="Remover bloco">×</button></header>${body}<span class="flow-port in"></span>${outs}</article>`;
  }).join('')}`;
  world.style.transform = `translate(${flowPan.x}px, ${flowPan.y}px) scale(${flowZoom})`;
  world.querySelectorAll('[data-flow-email]').forEach(select => {
    select.value = sequenceDraft.nodes.find(node => node.id === select.dataset.flowEmail)?.campaignId || '';
    select.addEventListener('change', () => { sequenceDraft.nodes.find(node => node.id === select.dataset.flowEmail).campaignId = select.value; });
  });
  world.querySelectorAll('[data-flow-wait]').forEach(input => input.addEventListener('change', () => { sequenceDraft.nodes.find(node => node.id === input.dataset.flowWait).hours = Number(input.value); }));
  world.querySelectorAll('[data-flow-when]').forEach(select => {
    select.value = sequenceDraft.nodes.find(node => node.id === select.dataset.flowWhen)?.when || 'opened';
    select.addEventListener('change', () => { sequenceDraft.nodes.find(node => node.id === select.dataset.flowWhen).when = select.value; });
  });
  world.querySelectorAll('[data-flow-remove]').forEach(button => button.addEventListener('click', () => removeFlowNode(button.dataset.flowRemove)));
  world.querySelectorAll('[data-node]').forEach(card => {
    const node = sequenceDraft.nodes.find(item => item.id === card.dataset.node);
    card.querySelector('[data-flow-drag]').addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const originX = node.x;
      const originY = node.y;
      const startX = event.clientX;
      const startY = event.clientY;
      const move = ev => {
        node.x = Math.max(0, Math.min(4000, Math.round(originX + (ev.clientX - startX) / flowZoom)));
        node.y = Math.max(0, Math.min(4000, Math.round(originY + (ev.clientY - startY) / flowZoom)));
        card.style.left = `${node.x}px`;
        card.style.top = `${node.y}px`;
        world.querySelector('.flow-wires').outerHTML = flowWires();
      };
      const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
    });
    card.querySelectorAll('[data-out]').forEach(port => port.addEventListener('click', event => {
      event.stopPropagation();
      flowLink = { id: node.id, port: port.dataset.out };
      paintFlow();
    }));
    card.addEventListener('click', () => {
      if (!flowLink || flowLink.id === node.id || reaches(node.id, flowLink.id)) return;
      sequenceDraft.nodes.find(item => item.id === flowLink.id)[flowLink.port] = node.id;
      flowLink = null;
      paintFlow();
    });
  });
}

function mountFlowStudio() {
  const root = document.querySelector('#sequence-steps');
  if (!root) return;
  root.innerHTML = `<div class="flow-studio"><aside class="flow-palette"><h2>Mensagens</h2><button type="button" draggable="true" data-flow-kind="email">E-mail</button><button type="button" draggable="true" data-flow-kind="wait">Espera</button><h2>Lógica</h2><button type="button" draggable="true" data-flow-kind="condition">Condição</button><p>Arraste para o quadro. Clique na bolinha e depois no próximo bloco. Arraste o fundo para mover.</p><form id="sequence-enroll" class="flow-enroll"><label>Sequência<select name="sequenceId" id="sequence-picker" required></select></label><label>Contato<select name="contactId" id="sequence-contact" required></select></label><button type="submit" class="button primary">Inscrever</button></form><div id="sequence-list" class="flow-list"></div></aside><div class="flow-stage" id="flow-stage"><div class="flow-world" id="flow-world"></div><div class="flow-zoom"><button type="button" id="flow-zoom-out" aria-label="Diminuir">−</button><button type="button" id="flow-zoom-in" aria-label="Aumentar">+</button></div></div></div>`;
  const stage = root.querySelector('#flow-stage');
  stage.addEventListener('dragover', event => event.preventDefault());
  stage.addEventListener('drop', event => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('text/plain');
    if (!['email', 'wait', 'condition'].includes(kind)) return;
    const rect = root.querySelector('#flow-world').getBoundingClientRect();
    addFlowNode(kind, Math.max(0, Math.round((event.clientX - rect.left) / flowZoom)), Math.max(0, Math.round((event.clientY - rect.top) / flowZoom)));
  });
  root.querySelectorAll('[data-flow-kind]').forEach(button => button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.dataset.flowKind)));
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.flow-node, button')) return;
    const originX = flowPan.x;
    const originY = flowPan.y;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = ev => {
      flowPan.x = originX + ev.clientX - startX;
      flowPan.y = originY + ev.clientY - startY;
      const world = root.querySelector('#flow-world');
      if (world) world.style.transform = `translate(${flowPan.x}px, ${flowPan.y}px) scale(${flowZoom})`;
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });
  root.querySelector('#flow-zoom-in').addEventListener('click', () => { flowZoom = Math.min(1.4, Math.round((flowZoom + 0.1) * 10) / 10); paintFlow(); });
  root.querySelector('#flow-zoom-out').addEventListener('click', () => { flowZoom = Math.max(0.6, Math.round((flowZoom - 0.1) * 10) / 10); paintFlow(); });
  paintFlow();
}
