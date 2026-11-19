// Local campaign drafting UI. Delivery controls will be added only with suppression and unsubscribe handling.
const originalView = window.view;
let campaignDrafts = [];
let campaignReviewSegments = [];
let campaignReviewEntries = [];
let editingCampaignId = '';

function campaignsMarkup() {
  return `<div class="campaign-note"><strong>Modo rascunho</strong><span>Esta etapa salva conteúdo e mostra o tamanho atual do público confirmado. Nenhum e-mail será enviado daqui.</span></div>
    <div class="campaign-layout"><section class="panel campaign-editor"><div class="panel-header"><div><div class="panel-title">${editingCampaignId ? 'Editar rascunho' : 'Novo rascunho'}</div><div class="panel-subtitle">Público elegível: contatos confirmados deste workspace. Pendente, descadastrado, bounce e reclamação ficam fora.</div></div></div>
      <form id="campaign-editor-form"><div class="campaign-fields"><label>Nome interno<input name="name" required maxlength="100" placeholder="Ex.: Conteúdo da semana"></label><label>Assunto<input name="subject" required maxlength="180" placeholder="O assunto que aparecerá na caixa de entrada"></label><label class="full">Pré-cabeçalho<input name="preheader" maxlength="180" placeholder="Complementa o assunto na caixa de entrada"></label><label>Conteúdo HTML<textarea name="html" rows="12" maxlength="200000" placeholder="Cole ou escreva o HTML do e-mail"></textarea></label><label>Versão em texto<textarea name="text" rows="12" maxlength="200000" placeholder="Versão em texto simples para clientes que não exibem HTML"></textarea></label></div><div class="campaign-editor-actions"><span id="campaign-feedback" role="status">Rascunho privado deste workspace.</span><div><button type="button" class="button secondary" id="campaign-reset">Novo rascunho</button><button type="button" class="button secondary" id="campaign-review-add" disabled>Adicionar à revisão</button><button type="submit" class="button primary">Salvar rascunho</button></div></div></form></section>
      <section class="panel campaign-preview-panel"><div class="panel-header"><div><div class="panel-title">Prévia do e-mail</div><div class="panel-subtitle">Scripts e recursos externos ficam bloqueados nesta prévia.</div></div></div><div class="email-preview-head"><strong id="campaign-preview-subject">Seu assunto aparecerá aqui</strong><span id="campaign-preview-preheader"></span></div><iframe id="campaign-preview" title="Prévia do conteúdo do e-mail" sandbox=""></iframe></section></div>
    <section class="panel campaign-review-panel"><div class="panel-header"><div><div class="panel-title">Preparar revisão</div><div class="panel-subtitle">Escolha um segmento. A contagem considera somente contatos com consentimento confirmado.</div></div></div><div class="campaign-review-controls"><label for="campaign-review-segment">Público da campanha<select id="campaign-review-segment"><option value="">Todos os contatos confirmados</option></select></label><p>Nenhum e-mail será enviado. A fila registra o rascunho e a contagem do público para revisão.</p></div><div id="campaign-review-list" class="campaign-review-list">Carregando…</div></section>
    <section class="panel campaign-list-panel"><div class="panel-header"><div><div class="panel-title">Rascunhos salvos</div><div class="panel-subtitle">Armazenados neste workspace; o público é recalculado com base nos consentimentos atuais.</div></div></div><div id="campaign-draft-list" class="campaign-draft-list">Carregando…</div></section>`;
}

function renderCampaigns() {
  const page = { title: 'Campanhas', kicker: 'MENSAGENS', subtitle: 'Prepare e revise e-mails antes de habilitar os envios.' };
  document.querySelector('#crumb').textContent = page.title;
  document.title = `SendMaster — ${page.title}`;
  document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === 'campanhas'));
  document.querySelector('#app').innerHTML = `<div class="page-head"><div><div class="eyebrow">${page.kicker}</div><h1>${page.title}</h1><p>${page.subtitle}</p></div><button class="button primary" id="campaign-new">+ Criar campanha</button></div>${campaignsMarkup()}`;
  const form = document.querySelector('#campaign-editor-form');
  form.addEventListener('input', renderCampaignPreview);
  form.addEventListener('submit', saveCampaign);
  document.querySelector('#campaign-reset').addEventListener('click', resetCampaignEditor);
  document.querySelector('#campaign-new').addEventListener('click', resetCampaignEditor);
  document.querySelector('#campaign-review-add').addEventListener('click', addCurrentCampaignToReview);
  document.querySelector('#campaign-draft-list').addEventListener('click', handleCampaignListClick);
  document.querySelector('#campaign-review-list').addEventListener('click', handleReviewQueueClick);
  renderCampaignPreview();
  void refreshCampaignDrafts();
}

async function refreshCampaignDrafts() {
  const workspaceId = activeWorkspace().id;
  try {
    const result = await api(`/api/workspaces/${encodeURIComponent(workspaceId)}/campaigns`);
    if (activeWorkspace().id !== workspaceId) return;
    campaignDrafts = result.campaigns;
    const list = document.querySelector('#campaign-draft-list');
    if (!list) return;
    list.innerHTML = campaignDrafts.length ? campaignDrafts.map(item => `<article class="campaign-draft-row"><div><strong>${escapeText(item.name)}</strong><span>Assunto: ${escapeText(item.subject)} · ${item.eligibleCount.toLocaleString('pt-BR')} destinatário(s) confirmados agora</span><small>Atualizado ${new Date(item.updatedAt).toLocaleString('pt-BR')}</small></div><button class="button secondary" data-edit-campaign="${escapeText(item.id)}">Editar</button><button class="button secondary" data-delete-campaign="${escapeText(item.id)}">Excluir</button></article>`).join('') : '<p class="campaign-empty">Ainda não há rascunhos neste workspace.</p>';
    await refreshCampaignReviewQueue();
  } catch (error) { const list = document.querySelector('#campaign-draft-list'); if (list) list.textContent = error.message; }
}

function renderCampaignPreview() {
  const form = document.querySelector('#campaign-editor-form');
  if (!form) return;
  const values = new FormData(form);
  document.querySelector('#campaign-preview-subject').textContent = String(values.get('subject') || 'Seu assunto aparecerá aqui');
  document.querySelector('#campaign-preview-preheader').textContent = String(values.get('preheader') || '');
  const html = String(values.get('html') || '<p>O conteúdo HTML será exibido aqui.</p>');
  const frame = document.querySelector('#campaign-preview');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{font:16px Arial,sans-serif;color:#27352d;padding:20px;line-height:1.55}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

async function saveCampaign(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const payload = Object.fromEntries(['name', 'subject', 'preheader', 'html', 'text'].map(key => [key, String(values[key] || '').trim()]));
  try {
    const path = `/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/campaigns${editingCampaignId ? `/${encodeURIComponent(editingCampaignId)}` : ''}`;
    const result = await api(path, { method: editingCampaignId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    editingCampaignId = result.campaign.id;
    document.querySelector('#campaign-review-add').disabled = false;
    document.querySelector('#campaign-feedback').textContent = `Salvo · ${result.campaign.eligibleCount.toLocaleString('pt-BR')} destinatário(s) confirmados atualmente.`;
    toast('Rascunho salvo neste workspace.');
    await refreshCampaignDrafts();
  } catch (error) { document.querySelector('#campaign-feedback').textContent = error.message; }
}

async function refreshCampaignReviewQueue() {
  const workspaceId = activeWorkspace().id;
  try {
    const result = await api(`/api/workspaces/${encodeURIComponent(workspaceId)}/campaign-review`);
    if (activeWorkspace().id !== workspaceId) return;
    campaignReviewSegments = result.segments;
    campaignReviewEntries = result.entries;
    const select = document.querySelector('#campaign-review-segment');
    if (select) {
      const selected = select.value;
      select.innerHTML = `<option value="">Todos os contatos confirmados</option>${campaignReviewSegments.map(segment => `<option value="${escapeText(segment.id)}">${escapeText(segment.name)}</option>`).join('')}`;
      select.value = campaignReviewSegments.some(segment => segment.id === selected) ? selected : '';
    }
    const list = document.querySelector('#campaign-review-list');
    if (!list) return;
    list.innerHTML = campaignReviewEntries.length ? campaignReviewEntries.map(entry => `<article class="campaign-review-row"><div><strong>${escapeText(entry.campaignName)}</strong><span>Público: ${escapeText(entry.segmentName)}</span><small>${entry.recipientCount.toLocaleString('pt-BR')} contato(s) quando entrou · ${entry.currentRecipientCount.toLocaleString('pt-BR')} elegível(is) agora</small>${entry.currentRecipientCount !== entry.recipientCount ? '<em>A quantidade mudou desde a revisão. Confira novamente antes de qualquer envio.</em>' : ''}</div><span class="review-status">Aguardando revisão</span><button type="button" class="button secondary" data-delete-review="${escapeText(entry.id)}">Remover</button></article>`).join('') : '<p class="campaign-empty">A fila de revisão está vazia.</p>';
  } catch (error) { const list = document.querySelector('#campaign-review-list'); if (list) list.textContent = error.message; }
}

async function addCurrentCampaignToReview() {
  if (!editingCampaignId) { toast('Salve o rascunho antes de adicioná-lo à revisão.'); return; }
  const button = document.querySelector('#campaign-review-add');
  button.disabled = true;
  try {
    const result = await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/campaign-review`, {
      method: 'POST', body: JSON.stringify({ campaignId: editingCampaignId, segmentId: document.querySelector('#campaign-review-segment').value || null }),
    });
    toast(`Campanha adicionada à revisão com ${result.entry.recipientCount.toLocaleString('pt-BR')} contato(s) elegíveis.`);
    await refreshCampaignReviewQueue();
  } catch (error) { document.querySelector('#campaign-feedback').textContent = error.message; }
  finally { button.disabled = !editingCampaignId; }
}

async function handleReviewQueueClick(event) {
  const remove = event.target.closest('[data-delete-review]');
  if (!remove) return;
  try {
    await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/campaign-review/${encodeURIComponent(remove.dataset.deleteReview)}`, { method: 'DELETE' });
    await refreshCampaignReviewQueue();
    toast('Item removido da fila de revisão.');
  } catch (error) { toast(error.message); }
}

function resetCampaignEditor() {
  editingCampaignId = '';
  const form = document.querySelector('#campaign-editor-form');
  if (!form) return;
  form.reset();
  document.querySelector('#campaign-review-add').disabled = true;
  document.querySelector('.campaign-editor .panel-title').textContent = 'Novo rascunho';
  document.querySelector('#campaign-feedback').textContent = 'Rascunho privado deste workspace.';
  renderCampaignPreview();
}

async function handleCampaignListClick(event) {
  const edit = event.target.closest('[data-edit-campaign]');
  const remove = event.target.closest('[data-delete-campaign]');
  if (edit) {
    const draft = campaignDrafts.find(item => item.id === edit.dataset.editCampaign);
    if (!draft) return;
    editingCampaignId = draft.id;
    const form = document.querySelector('#campaign-editor-form');
    for (const key of ['name', 'subject', 'preheader', 'html', 'text']) form.elements.namedItem(key).value = draft[key];
    document.querySelector('.campaign-editor .panel-title').textContent = 'Editar rascunho';
    document.querySelector('#campaign-feedback').textContent = `Público atual: ${draft.eligibleCount.toLocaleString('pt-BR')} contatos confirmados.`;
    renderCampaignPreview();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (remove) {
    if (!confirm('Excluir este rascunho?')) return;
    try {
      await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/campaigns/${encodeURIComponent(remove.dataset.deleteCampaign)}`, { method: 'DELETE' });
      if (editingCampaignId === remove.dataset.deleteCampaign) resetCampaignEditor();
      await refreshCampaignDrafts();
      toast('Rascunho excluído.');
    } catch (error) { toast(error.message); }
  }
}

function campaignsView(key) {
  if (key === 'campanhas') return renderCampaigns();
  return originalView(key);
}
window.view = campaignsView;

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action="campanhas"]');
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.view('campanhas');
}, true);
