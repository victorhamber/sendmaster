// Fluxo horizontal com um ramo sim/não. Inscrever só grava a fila.
const sequencesPreviousView = window.view;

let sequenceDraft = { start: 's1', nodes: [{ id: 's1', kind: 'email', campaignId: '', next: null }] };
let sequenceCampaigns = [];

function renderSequences() {
  document.querySelector('#crumb').textContent = 'Automações';
  document.title = 'SendMaster — Automações';
  document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === 'automacoes'));
  document.querySelector('#app').innerHTML = `<div class="flow-page"><form id="sequence-form" class="flow-bar"><label>Nome<input name="name" required maxlength="100" placeholder="Ex.: Boas-vindas"></label><span id="sequence-feedback" role="status">Comece com um e-mail já salvo em Campanhas.</span><button type="submit" class="button primary">Salvar sequência</button></form><div id="sequence-steps"></div></div>`;
  document.querySelector('#sequence-form').addEventListener('submit', saveSequenceForm);
  sequenceDraft = { start: 's1', nodes: [{ id: 's1', kind: 'email', campaignId: '', next: null }] };
  void loadSequencePage();
}

function drawSequenceSteps() {
  mountFlowStudio();
  document.querySelector('#sequence-enroll')?.addEventListener('submit', enrollSequenceForm);
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
  document.querySelector('.content')?.classList.toggle('content-flow', key === 'automacoes');
  if (key === 'automacoes') return renderSequences();
  return sequencesPreviousView(key);
}
window.view = sequencesView;
