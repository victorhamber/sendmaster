// Relatório de campanha. Os números vêm das mensagens já enviadas.
const reportsPreviousView = window.view;

function reportRate(part, total) {
  if (!total) return '—';
  return `${Math.round((part / total) * 1000) / 10}%`.replace('.', ',');
}

function renderReports() {
  document.querySelector('#crumb').textContent = 'Relatórios';
  document.title = 'SendMaster — Relatórios';
  document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === 'relatorios'));
  document.querySelector('#app').innerHTML = `<div class="page-head"><div><div class="eyebrow">DESEMPENHO</div><h1>Relatórios</h1><p>Aberturas e cliques contam por mensagem enviada. Um proxy de imagem pode abrir o pixel sem a pessoa ler o e-mail.</p></div><button class="button primary" id="report-export" type="button">Exportar relatório</button></div><section class="panel"><div class="table-scroll"><table class="table"><thead><tr><th>CAMPANHA</th><th>ENVIADOS</th><th>ABERTURAS</th><th>CLIQUES</th></tr></thead><tbody id="report-rows"><tr><td colspan="4">Carregando…</td></tr></tbody></table></div></section>`;
  document.querySelector('#report-export').addEventListener('click', downloadReport);
  void loadReports();
}

async function loadReports() {
  const workspaceId = activeWorkspace().id;
  const body = document.querySelector('#report-rows');
  try {
    const result = await api(`/api/workspaces/${encodeURIComponent(workspaceId)}/reports`);
    if (activeWorkspace().id !== workspaceId || !body) return;
    body.innerHTML = result.campaigns.length
      ? result.campaigns.map(row => `<tr><td>${escapeText(row.name)}</td><td>${row.sent}</td><td>${row.opened} <small>${reportRate(row.opened, row.sent)}</small></td><td>${row.clicked} <small>${reportRate(row.clicked, row.sent)}</small></td></tr>`).join('')
      : '<tr><td colspan="4" class="empty-contacts">Nenhuma campanha neste workspace.</td></tr>';
  } catch (error) {
    if (body) body.innerHTML = `<tr><td colspan="4">${escapeText(error.message)}</td></tr>`;
  }
}

async function downloadReport() {
  try {
    const result = await api(`/api/workspaces/${encodeURIComponent(activeWorkspace().id)}/reports`);
    const lines = ['campanha,enviados,aberturas,cliques', ...result.campaigns.map(row => `${String(row.name).replaceAll(',', ' ')},${row.sent},${row.opened},${row.clicked}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relatorio-sendmaster.csv';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) { toast(error.message); }
}

function reportsView(key) {
  if (key === 'relatorios') return renderReports();
  return reportsPreviousView(key);
}
window.view = reportsView;
