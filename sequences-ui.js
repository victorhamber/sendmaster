// Fluxo horizontal com um ramo sim/não. Inscrever só grava a fila.
const sequencesPreviousView = window.view;

function newStepId() {
  return `s${Math.random().toString(36).slice(2, 8)}`;
}

let sequenceDraft = { start: 's1', nodes: [{ id: 's1', kind: 'email', campaignId: '', next: null }] };
let sequenceCampaigns = [];

function renderSequences() {
  document.querySelector('#crumb').textContent = 'Automações';
  document.title = 'SendMaster — Automações';
  document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === 'automacoes'));
  document.querySelector('#app').innerHTML = `<div class="page-head"><div><div class="eyebrow">JORNADAS</div><h1>Automações</h1><p>O fluxo segue para o lado. A condição abre dois caminhos: sim e não. Inscrever não envia.</p></div></div>
    <section class="panel"><form id="sequence-form"><div class="campaign-fields"><label>Nome<input name="name" required maxlength="100" placeholder="Ex.: Boas-vindas"></label></div>
      <div id="sequence-steps"></div>
      <div class="campaign-editor-actions"><span id="sequence-feedback" role="status">Comece com um e-mail já salvo em Campanhas.</span><div id="sequence-actions"></div></div></form></section>
    <section class="panel"><div class="panel-title">Inscrever contato confirmado</div><form id="sequence-enroll" class="campaign-fields"><label>Sequência<select name="sequenceId" id="sequence-picker" required></select></label><label>Contato<select name="contactId" id="sequence-contact" required></select></label><div class="full"><button type="submit" class="button primary">Inscrever</button></div></form></section>
    <section class="panel"><div id="sequence-list">Carregando…</div></section>`;
  document.querySelector('#sequence-form').addEventListener('submit', saveSequenceForm);
  document.querySelector('#sequence-enroll').addEventListener('submit', enrollSequenceForm);
  sequenceDraft = { start: 's1', nodes: [{ id: 's1', kind: 'email', campaignId: '', next: null }] };
  void loadSequencePage();
}

function nodeById(id) {
  return sequenceDraft.nodes.find(node => node.id === id);
}

function chain(id) {
  const cards = [];
  const seen = new Set();
  let cursor = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = nodeById(cursor);
    if (!node) break;
    cards.push(node);
    if (node.kind === 'condition') break;
    cursor = node.next;
  }
  return cards;
}

function appendNode(fromId, link, step) {
  if (sequenceDraft.nodes.length >= 12) return;
  const node = { id: newStepId(), ...step };
  const parent = nodeById(fromId);
  if (!parent) return;
  if (link === 'next') parent.next = node.id;
  else parent[link] = node.id;
  sequenceDraft.nodes.push(node);
  drawSequenceSteps();
}

function drawCards(nodes) {
  const options = sequenceCampaigns.map(campaign => `<option value="${escapeText(campaign.id)}">${escapeText(campaign.name)}</option>`).join('');
  return nodes.map((node, index) => {
    const arrow = index ? '<span class="flow-arrow" aria-hidden="true">→</span>' : '';
    let body = '';
    if (node.kind === 'email') body = `<span>E-mail</span><select data-flow-email="${node.id}"><option value="">Escolha a campanha</option>${options}</select>`;
    else if (node.kind === 'wait') body = `<span>Espera</span><input data-flow-wait="${node.id}" type="number" min="1" max="8760" value="${node.hours}" aria-label="Horas de espera">`;
    else body = `<span>Condição</span><select data-flow-when="${node.id}"><option value="opened">Se abriu o e-mail anterior</option><option value="clicked">Se clicou em um link</option></select>`;
    return `${arrow}<article class="flow-card">${body}</article>`;
  }).join('');
}

function bindCards(root) {
  root.querySelectorAll('[data-flow-email]').forEach(select => {
    select.value = nodeById(select.dataset.flowEmail)?.campaignId || '';
    select.addEventListener('change', () => { nodeById(select.dataset.flowEmail).campaignId = select.value; });
  });
  root.querySelectorAll('[data-flow-wait]').forEach(input => input.addEventListener('change', () => { nodeById(input.dataset.flowWait).hours = Number(input.value); }));
  root.querySelectorAll('[data-flow-when]').forEach(select => {
    select.value = nodeById(select.dataset.flowWhen)?.when || 'opened';
    select.addEventListener('change', () => { nodeById(select.dataset.flowWhen).when = select.value; });
  });
}

function drawSequenceSteps() {
  const root = document.querySelector('#sequence-steps');
  const actions = document.querySelector('#sequence-actions');
  if (!root || !actions) return;
  const main = chain(sequenceDraft.start);
  const condition = main.find(node => node.kind === 'condition');
  const tail = main[main.length - 1];
  const yes = condition ? chain(condition.yes) : [];
  const no = condition ? chain(condition.no) : [];
  root.innerHTML = `<div class="flow-board"><div class="flow-row">${drawCards(main)}</div>${condition ? `<div class="flow-branches"><section class="flow-branch"><strong>Sim</strong><div class="flow-row">${drawCards(yes) || '<p class="tag-empty">Nada neste caminho.</p>'}</div><div class="flow-branch-actions"><button type="button" class="button secondary" data-flow-add="yes">+ E-mail</button><button type="button" class="button secondary" data-flow-add="yes-wait">+ Espera</button></div></section><section class="flow-branch"><strong>Não</strong><div class="flow-row">${drawCards(no) || '<p class="tag-empty">Nada neste caminho. A sequência para.</p>'}</div><div class="flow-branch-actions"><button type="button" class="button secondary" data-flow-add="no">+ E-mail</button><button type="button" class="button secondary" data-flow-add="no-wait">+ Espera</button></div></section></div>` : ''}</div>`;
  actions.innerHTML = condition ? '' : `<button type="button" class="button secondary" id="sequence-add-email">+ E-mail</button><button type="button" class="button secondary" id="sequence-add-wait">+ Espera</button><button type="button" class="button secondary" id="sequence-add-condition">+ Condição</button><button type="submit" class="button primary">Salvar sequência</button>`;
  if (condition) actions.innerHTML = `<button type="submit" class="button primary">Salvar sequência</button>`;
  bindCards(root);
  document.querySelector('#sequence-add-email')?.addEventListener('click', () => appendNode(tail.id, 'next', { kind: 'email', campaignId: '', next: null }));
  document.querySelector('#sequence-add-wait')?.addEventListener('click', () => appendNode(tail.id, 'next', { kind: 'wait', hours: 24, next: null }));
  document.querySelector('#sequence-add-condition')?.addEventListener('click', () => appendNode(tail.id, 'next', { kind: 'condition', when: 'opened', yes: null, no: null }));
  root.querySelectorAll('[data-flow-add]').forEach(button => button.addEventListener('click', () => {
    const kind = button.dataset.flowAdd;
    const side = kind.startsWith('yes') ? 'yes' : 'no';
    const branch = side === 'yes' ? yes : no;
    const from = branch.length ? branch[branch.length - 1].id : condition.id;
    const link = branch.length ? 'next' : side;
    const step = kind.endsWith('wait') ? { kind: 'wait', hours: 24, next: null } : { kind: 'email', campaignId: '', next: null };
    appendNode(from, link, step);
  }));
}

function flowLabel(flow) {
  if (!flow || !Array.isArray(flow.nodes)) return 'Fluxo salvo';
  return flow.nodes.map(node => node.kind === 'email' ? 'E-mail' : node.kind === 'wait' ? `Espera ${node.hours}h` : 'Condição').join(' → ');
}

async function loadSequencePage() {
  const workspaceId = activeWorkspace().id;
  try {
    const [campaigns, saved, contacts] = await Promise.all([
      api(`/api/workspaces/${encodeURIComponent(workspaceId)}/campaigns`),
      api(`/api/workspaces/${encodeURIComponent(workspaceId)}/sequences`),
      api(`/api/workspaces/${encodeURIComponent(workspaceId)}/contacts?status=confirmed`),
    ]);
    if (activeWorkspace().id !== workspaceId) return;
    sequenceCampaigns = campaigns.campaigns;
    drawSequenceSteps();
    document.querySelector('#sequence-picker').innerHTML = saved.sequences.map(item => `<option value="${escapeText(item.id)}">${escapeText(item.name)}</option>`).join('') || '<option value="">Nenhuma sequência</option>';
    document.querySelector('#sequence-contact').innerHTML = contacts.contacts.map(contact => `<option value="${escapeText(contact.id)}">${escapeText(contact.email)}</option>`).join('') || '<option value="">Nenhum contato confirmado</option>';
    document.querySelector('#sequence-list').innerHTML = saved.sequences.length ? saved.sequences.map(item => `<p><strong>${escapeText(item.name)}</strong> — ${escapeText(Array.isArray(item.steps) ? item.steps.map(step => step.kind).join(' → ') : flowLabel(item.steps))}</p>`).join('') : '<p class="tag-empty">Nenhuma sequência salva.</p>';
  } catch (error) { toast(error.message); }
}

async function saveSequenceForm(event) {
  event.preventDefault();
  const name = new FormData(event.currentTarget).get('name').toString();
  try {
    await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/sequences`, { method: 'POST', body: JSON.stringify({ name, steps: sequenceDraft }) });
    document.querySelector('#sequence-feedback').textContent = 'Sequência salva. Inscrever não envia o e-mail.';
    await loadSequencePage();
  } catch (error) { document.querySelector('#sequence-feedback').textContent = error.message; }
}

async function enrollSequenceForm(event) {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  try {
    await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/sequences/${encodeURIComponent(values.get('sequenceId'))}/enroll`, { method: 'POST', body: JSON.stringify({ contactId: values.get('contactId') }) });
    toast('Contato inscrito. O primeiro e-mail entra na fila.');
  } catch (error) { toast(error.message); }
}

function sequencesView(key) {
  if (key === 'automacoes') return renderSequences();
  return sequencesPreviousView(key);
}
window.view = sequencesView;
