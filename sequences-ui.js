// Sequência linear na tela de automações. O botão só grava a inscrição.
const sequencesPreviousView = window.view;

function sequenceStepLabel(step) {
  if (step.kind === 'email') return 'E-mail';
  if (step.kind === 'wait') return `Espera de ${step.hours} h`;
  return step.when === 'opened' ? 'Se abriu' : step.when === 'not_opened' ? 'Se não abriu' : step.when === 'clicked' ? 'Se clicou' : 'Se não clicou';
}

function renderSequences() {
  document.querySelector('#crumb').textContent = 'Automações';
  document.title = 'SendMaster — Automações';
  document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === 'automacoes'));
  document.querySelector('#app').innerHTML = `<div class="page-head"><div><div class="eyebrow">JORNADAS</div><h1>Automações</h1><p>A sequência é uma lista: e-mail, espera e condição. Inscrever não envia. O worker da fila envia depois.</p></div></div>
    <section class="panel"><form id="sequence-form"><div class="campaign-fields"><label>Nome<input name="name" required maxlength="100" placeholder="Ex.: Boas-vindas"></label></div>
      <div id="sequence-steps"></div>
      <div class="campaign-editor-actions"><span id="sequence-feedback" role="status">Comece com um e-mail já salvo em Campanhas.</span><div><button type="button" class="button secondary" id="sequence-add-email">+ E-mail</button><button type="button" class="button secondary" id="sequence-add-wait">+ Espera</button><button type="button" class="button secondary" id="sequence-add-condition">+ Condição</button><button type="submit" class="button primary">Salvar sequência</button></div></div></form></section>
    <section class="panel"><div class="panel-title">Inscrever contato confirmado</div><form id="sequence-enroll" class="campaign-fields"><label>Sequência<select name="sequenceId" id="sequence-picker" required></select></label><label>Contato<select name="contactId" id="sequence-contact" required></select></label><button type="submit" class="button primary">Inscrever</button></form></section>
    <section class="panel"><div id="sequence-list">Carregando…</div></section>`;
  document.querySelector('#sequence-add-email').addEventListener('click', () => addSequenceStep({ kind: 'email', campaignId: '' }));
  document.querySelector('#sequence-add-wait').addEventListener('click', () => addSequenceStep({ kind: 'wait', hours: 24 }));
  document.querySelector('#sequence-add-condition').addEventListener('click', () => addSequenceStep({ kind: 'condition', when: 'opened' }));
  document.querySelector('#sequence-form').addEventListener('submit', saveSequenceForm);
  document.querySelector('#sequence-enroll').addEventListener('submit', enrollSequenceForm);
  sequenceDraft = [{ kind: 'email', campaignId: '' }];
  void loadSequencePage();
}

let sequenceDraft = [];
let sequenceCampaigns = [];

function addSequenceStep(step) {
  if (sequenceDraft.length >= 12) return;
  sequenceDraft.push(step);
  drawSequenceSteps();
}

function drawSequenceSteps() {
  const root = document.querySelector('#sequence-steps');
  if (!root) return;
  const options = sequenceCampaigns.map(campaign => `<option value="${escapeText(campaign.id)}">${escapeText(campaign.name)}</option>`).join('');
  root.innerHTML = sequenceDraft.map((step, index) => {
    if (step.kind === 'email') return `<label>E-mail ${index + 1}<select data-sequence-email="${index}"><option value="">Escolha a campanha</option>${options}</select></label>`;
    if (step.kind === 'wait') return `<label>Espera em horas<input data-sequence-wait="${index}" type="number" min="1" max="8760" value="${step.hours}"></label>`;
    return `<label>Condição<select data-sequence-when="${index}"><option value="opened">Se abriu o e-mail anterior</option><option value="not_opened">Se não abriu</option><option value="clicked">Se clicou</option><option value="not_clicked">Se não clicou</option></select></label>`;
  }).join('');
  root.querySelectorAll('[data-sequence-email]').forEach(select => { select.value = sequenceDraft[Number(select.dataset.sequenceEmail)].campaignId || ''; select.addEventListener('change', () => { sequenceDraft[Number(select.dataset.sequenceEmail)].campaignId = select.value; }); });
  root.querySelectorAll('[data-sequence-wait]').forEach(input => input.addEventListener('change', () => { sequenceDraft[Number(input.dataset.sequenceWait)].hours = Number(input.value); }));
  root.querySelectorAll('[data-sequence-when]').forEach(select => { select.value = sequenceDraft[Number(select.dataset.sequenceWhen)].when; select.addEventListener('change', () => { sequenceDraft[Number(select.dataset.sequenceWhen)].when = select.value; }); });
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
    const picker = document.querySelector('#sequence-picker');
    picker.innerHTML = saved.sequences.map(item => `<option value="${escapeText(item.id)}">${escapeText(item.name)}</option>`).join('') || '<option value="">Nenhuma sequência</option>';
    document.querySelector('#sequence-contact').innerHTML = contacts.contacts.map(contact => `<option value="${escapeText(contact.id)}">${escapeText(contact.email)}</option>`).join('') || '<option value="">Nenhum contato confirmado</option>';
    document.querySelector('#sequence-list').innerHTML = saved.sequences.length ? saved.sequences.map(item => `<p><strong>${escapeText(item.name)}</strong> — ${item.steps.map(sequenceStepLabel).join(' → ')}</p>`).join('') : '<p class="tag-empty">Nenhuma sequência salva.</p>';
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
