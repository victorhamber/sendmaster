// Construtor em tela cheia. Os blocos viram o HTML do rascunho.
import { renderEmailHtml, renderEmailText } from './email-layout.js';

const mailPalette = [
  ['Básicos', [['heading', 'Título'], ['text', 'Texto'], ['button', 'Botão'], ['divider', 'Divisor'], ['spacer', 'Espaçador']]],
  ['Mídia', [['image', 'Imagem']]],
  ['Avançado', [['columns', 'Colunas'], ['social', 'Redes sociais'], ['html', 'HTML'], ['footer', 'Rodapé']]],
];
const mailFonts = [['georgia', 'Georgia'], ['arial', 'Arial'], ['verdana', 'Verdana'], ['trebuchet', 'Trebuchet'], ['courier', 'Courier']];
const mailAligns = [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']];
const mailType = [
  ['text', 'Texto', 'area'],
  ['url', 'Link https', 'text'],
  ['font', 'Fonte', 'select', mailFonts],
  ['fontSize', 'Tamanho', 'number', 10, 72],
  ['color', 'Cor do texto', 'color'],
  ['background', 'Cor de fundo', 'color'],
  ['align', 'Alinhamento', 'select', mailAligns],
  ['bold', 'Negrito', 'check'],
  ['italic', 'Itálico', 'check'],
  ['underline', 'Sublinhado', 'check'],
];
const mailFields = {
  heading: mailType,
  text: mailType,
  button: [
    ['text', 'Texto do botão', 'text'],
    ['url', 'Link https', 'text'],
    ['font', 'Fonte', 'select', mailFonts],
    ['fontSize', 'Tamanho', 'number', 10, 32],
    ['color', 'Cor do texto', 'color'],
    ['background', 'Cor do botão', 'color'],
    ['borderColor', 'Cor da borda', 'color'],
    ['borderWidth', 'Borda', 'number', 0, 8],
    ['radius', 'Cantos', 'number', 0, 40],
    ['align', 'Alinhamento', 'select', mailAligns],
    ['bold', 'Negrito', 'check'],
  ],
  image: [['url', 'Imagem https', 'text'], ['link', 'Link ao clicar', 'text'], ['text', 'Descrição', 'text'], ['width', 'Largura %', 'number', 10, 100], ['align', 'Alinhamento', 'select', mailAligns]],
  divider: [['color', 'Cor', 'color'], ['height', 'Espessura', 'number', 1, 8]],
  spacer: [['height', 'Altura', 'number', 8, 80]],
  columns: [['left', 'Coluna esquerda', 'area'], ['right', 'Coluna direita', 'area']],
  social: [],
  html: [['html', 'HTML', 'area']],
  footer: [['text', 'Texto do rodapé', 'area'], ['color', 'Cor do texto', 'color'], ['align', 'Alinhamento', 'select', mailAligns]],
};
const mailSeed = {
  heading: { text: 'Título', font: 'georgia', fontSize: 32, color: '#20352c', bold: 'yes', align: 'left' },
  text: { text: 'Texto', font: 'georgia', fontSize: 16, color: '#304037', align: 'left' },
  button: { text: 'Abrir', font: 'arial', fontSize: 16, color: '#ffffff', background: '#176b50', borderColor: '#176b50', borderWidth: 0, radius: 7, bold: 'yes', align: 'center' },
  image: { width: 100, align: 'center' },
  divider: { color: '#d7e1da', height: 1 },
  spacer: { height: 24 },
  social: { networks: [{ type: 'facebook', url: '' }, { type: 'instagram', url: '' }, { type: 'linkedin', url: '' }] },
  footer: { text: 'Você recebe este e-mail porque pediu.', color: '#65736a', align: 'center' },
};
const mailNames = Object.fromEntries(mailPalette.flatMap(([, items]) => items));
const mailNetworks = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['x', 'X'], ['youtube', 'YouTube'], ['website', 'Site']];
let mailBlocks = [];
let mailSelected = '';
let mailPreview = false;

function mailCompany() {
  const space = typeof activeWorkspace === 'function' ? activeWorkspace() : {};
  return { company: space.companyName || space.name || '', privacyUrl: space.privacyUrl || '', termsUrl: space.termsUrl || '' };
}

function mailPreviewDoc() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"></head><body style="margin:0;padding:24px 0;background:#e7ece9">${renderEmailHtml(mailBlocks, mailCompany())}</body></html>`;
}

function mailHost() {
  let host = document.querySelector('#mail-studio');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'mail-studio';
  host.className = 'mail-studio';
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

function openEmailBuilder() {
  const host = mailHost();
  host.hidden = false;
  const savedWidth = Number(localStorage.getItem('sendmaster.mailPropsWidth'));
  if (savedWidth >= 220 && savedWidth <= 520) host.style.setProperty('--mail-props', `${savedWidth}px`);
  host.innerHTML = `<header class="mail-studio-bar"><button type="button" class="button secondary" id="mail-studio-close">Voltar</button><strong>Construtor de e-mail</strong><span class="mail-studio-actions"><button type="button" class="button secondary" id="mail-studio-preview">Prévia</button><button type="button" class="button primary" id="mail-studio-apply">Usar no rascunho</button></span></header><aside class="mail-palette"><p>Arraste um bloco para a folha.</p>${mailPalette.map(([title, items]) => `<h2>${title}</h2>${items.map(([type, name]) => `<button type="button" draggable="true" data-mail-type="${type}">${name}</button>`).join('')}`).join('')}</aside><main class="mail-stage"><div class="mail-sheet" id="mail-sheet"></div></main><aside class="mail-props" id="mail-props"><div class="mail-resizer" id="mail-resizer"></div><div id="mail-fields"></div></aside>`;
  host.querySelector('#mail-studio-close').addEventListener('click', () => { host.hidden = true; mailPreview = false; });
  host.querySelector('#mail-studio-apply').addEventListener('click', applyMailLayout);
  host.querySelector('#mail-studio-preview').addEventListener('click', () => { mailPreview = !mailPreview; drawMailSheet(); });
  host.querySelector('#mail-resizer').addEventListener('pointerdown', event => {
    event.preventDefault();
    const move = ev => {
      const width = Math.max(220, Math.min(520, window.innerWidth - ev.clientX));
      host.style.setProperty('--mail-props', `${width}px`);
      localStorage.setItem('sendmaster.mailPropsWidth', String(width));
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });
  host.querySelectorAll('[data-mail-type]').forEach(button => button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.dataset.mailType)));
  const sheet = host.querySelector('#mail-sheet');
  sheet.addEventListener('dragover', event => event.preventDefault());
  sheet.addEventListener('drop', event => {
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain');
    if (!mailFields[type] || mailBlocks.length >= 30) return;
    const block = { id: `m${Date.now()}`, type, text: '', url: '', url2: '', url3: '', html: '', link: '', left: '', right: '', ...(mailSeed[type] || {}) };
    mailBlocks.push(block);
    mailSelected = block.id;
    drawMailSheet();
  });
  drawMailSheet();
}

function applyMailLayout() {
  const form = document.querySelector('#campaign-editor-form');
  if (!form) return;
  form.elements.namedItem('html').value = renderEmailHtml(mailBlocks, mailCompany());
  form.elements.namedItem('text').value = renderEmailText(mailBlocks, mailCompany());
  form.dispatchEvent(new Event('input', { bubbles: true }));
  mailHost().hidden = true;
  toast('Layout copiado para o rascunho. Salve a campanha.');
}

function drawMailSheet() {
  const sheet = document.querySelector('#mail-sheet');
  const props = document.querySelector('#mail-fields');
  const previewButton = document.querySelector('#mail-studio-preview');
  if (!sheet || !props) return;
  if (previewButton) previewButton.textContent = mailPreview ? 'Editar' : 'Prévia';
  if (mailPreview) {
    sheet.innerHTML = '<iframe class="mail-preview-frame" sandbox="" title="Prévia do e-mail"></iframe>';
    const frame = sheet.querySelector('iframe');
    frame.srcdoc = mailPreviewDoc();
  } else {
    sheet.innerHTML = mailBlocks.length ? mailBlocks.map(block => `<article class="mail-block${block.id === mailSelected ? ' selected' : ''}" draggable="true" data-mail-id="${block.id}"><header><strong>${escapeText(mailNames[block.type] || block.type)}</strong><button type="button" data-mail-remove="${block.id}" aria-label="Remover bloco">×</button></header><div class="mail-block-preview">${renderEmailHtml([block], mailCompany())}</div></article>`).join('') : '<p class="tag-empty">Arraste título, texto, botão ou imagem para cá.</p>';
  }
  const selected = mailBlocks.find(block => block.id === mailSelected);
  const fields = selected ? mailFields[selected.type] : [];
  const control = ([key, label, kind, extra, max]) => {
    if (kind === 'area') return `<label>${label}<textarea data-mail-field="${key}">${escapeText(selected[key] || '')}</textarea></label>`;
    if (kind === 'select') return `<label>${label}<select data-mail-field="${key}">${extra.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label>`;
    if (kind === 'check') return `<label class="mail-check"><input type="checkbox" data-mail-field="${key}" ${selected[key] === 'yes' ? 'checked' : ''}>${label}</label>`;
    if (kind === 'color') return `<label>${label}<input type="color" data-mail-field="${key}" value="${/^#[0-9a-f]{6}$/i.test(selected[key] || '') ? selected[key] : '#176b50'}"></label>`;
    if (kind === 'number') return `<label>${label}<input type="number" data-mail-field="${key}" min="${extra}" max="${max}" value="${escapeText(selected[key] ?? extra)}"></label>`;
    return `<label>${label}<input data-mail-field="${key}" value="${escapeText(selected[key] || '')}"></label>`;
  };
  const grouped = [];
  let checks = [];
  const flushChecks = () => { if (checks.length) { grouped.push(`<div class="mail-toggles">${checks.join('')}</div>`); checks = []; } };
  for (const field of fields) {
    if (field[2] === 'check') checks.push(control(field));
    else { flushChecks(); grouped.push(control(field)); }
  }
  flushChecks();
  const company = mailCompany();
  const socialEditor = selected?.type === 'social' ? `<div class="mail-networks">${(selected.networks || []).map((item, index) => `<div class="mail-network"><select data-mail-net="${index}">${mailNetworks.map(([value, name]) => `<option value="${value}"${item.type === value ? ' selected' : ''}>${name}</option>`).join('')}</select><input data-mail-net-url="${index}" value="${escapeText(item.url || '')}" placeholder="https://"><button type="button" data-mail-net-remove="${index}" aria-label="Remover rede">×</button></div>`).join('')}<button type="button" class="button secondary" id="mail-net-add">Adicionar rede</button></div>` : '';
  const footerNote = selected?.type === 'footer' ? `<p>Empresa: ${escapeText(company.company || 'sem nome')}. Política e termos vêm de Configurar empresa, no menu do workspace.</p>` : '';
  props.innerHTML = selected ? `<h2>${escapeText(mailNames[selected.type])}</h2>${grouped.join('')}${socialEditor}${footerNote}` : '<p class="tag-empty">Selecione um bloco para editar.</p>';
  sheet.querySelectorAll('[data-mail-id]').forEach(card => {
    card.addEventListener('click', () => { mailSelected = card.dataset.mailId; drawMailSheet(); });
    card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', `move:${card.dataset.mailId}`));
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      const moving = event.dataTransfer.getData('text/plain');
      if (!moving.startsWith('move:')) return;
      const from = mailBlocks.findIndex(block => block.id === moving.slice(5));
      const to = mailBlocks.findIndex(block => block.id === card.dataset.mailId);
      if (from < 0 || to < 0 || from === to) return;
      const [item] = mailBlocks.splice(from, 1);
      mailBlocks.splice(to, 0, item);
      drawMailSheet();
    });
  });
  sheet.querySelectorAll('[data-mail-remove]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    mailBlocks = mailBlocks.filter(block => block.id !== button.dataset.mailRemove);
    if (mailSelected === button.dataset.mailRemove) mailSelected = mailBlocks[0]?.id || '';
    drawMailSheet();
  }));
  props.querySelectorAll('select[data-mail-field]').forEach(field => { field.value = selected?.[field.dataset.mailField] || field.options[0].value; });
  props.querySelectorAll('[data-mail-field]').forEach(field => field.addEventListener('input', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block) return;
    block[field.dataset.mailField] = field.type === 'checkbox' ? (field.checked ? 'yes' : '') : field.value;
    paintMail(block);
  }));
  props.querySelectorAll('[data-mail-net]').forEach(field => field.addEventListener('change', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block?.networks) return;
    block.networks[Number(field.dataset.mailNet)].type = field.value;
    paintMail(block);
  }));
  props.querySelectorAll('[data-mail-net-url]').forEach(field => field.addEventListener('input', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block?.networks) return;
    block.networks[Number(field.dataset.mailNetUrl)].url = field.value;
    paintMail(block);
  }));
  props.querySelector('#mail-net-add')?.addEventListener('click', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block || (block.networks || []).length >= 6) return;
    block.networks.push({ type: 'website', url: '' });
    drawMailSheet();
  });
  props.querySelectorAll('[data-mail-net-remove]').forEach(button => button.addEventListener('click', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block?.networks) return;
    block.networks.splice(Number(button.dataset.mailNetRemove), 1);
    drawMailSheet();
  }));
}

function paintMail(block) {
  const sheet = document.querySelector('#mail-sheet');
  if (!sheet) return;
  if (mailPreview) {
    const frame = sheet.querySelector('iframe');
    if (frame) frame.srcdoc = mailPreviewDoc();
    return;
  }
  const card = sheet.querySelector(`[data-mail-id="${block.id}"] .mail-block-preview`);
  if (card) card.innerHTML = renderEmailHtml([block], mailCompany());
}

window.openEmailBuilder = openEmailBuilder;
