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
  social: [['url', 'Facebook https', 'text'], ['url2', 'Instagram https', 'text'], ['url3', 'LinkedIn https', 'text']],
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
  footer: { text: 'Você recebe este e-mail porque pediu.', color: '#65736a', align: 'center' },
};
const mailNames = Object.fromEntries(mailPalette.flatMap(([, items]) => items));
let mailBlocks = [];
let mailSelected = '';

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
  host.innerHTML = `<header class="mail-studio-bar"><button type="button" class="button secondary" id="mail-studio-close">Voltar</button><strong>Construtor de e-mail</strong><button type="button" class="button primary" id="mail-studio-apply">Usar no rascunho</button></header><aside class="mail-palette"><p>Arraste um bloco para a folha.</p>${mailPalette.map(([title, items]) => `<h2>${title}</h2>${items.map(([type, name]) => `<button type="button" draggable="true" data-mail-type="${type}">${name}</button>`).join('')}`).join('')}</aside><main class="mail-stage"><div class="mail-sheet" id="mail-sheet"></div></main><aside class="mail-props" id="mail-props"></aside>`;
  host.querySelector('#mail-studio-close').addEventListener('click', () => { host.hidden = true; });
  host.querySelector('#mail-studio-apply').addEventListener('click', applyMailLayout);
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
  form.elements.namedItem('html').value = renderEmailHtml(mailBlocks);
  form.elements.namedItem('text').value = renderEmailText(mailBlocks);
  form.dispatchEvent(new Event('input', { bubbles: true }));
  mailHost().hidden = true;
  toast('Layout copiado para o rascunho. Salve a campanha.');
}

function drawMailSheet() {
  const sheet = document.querySelector('#mail-sheet');
  const props = document.querySelector('#mail-props');
  if (!sheet || !props) return;
  sheet.innerHTML = mailBlocks.length ? mailBlocks.map(block => `<article class="mail-block${block.id === mailSelected ? ' selected' : ''}" draggable="true" data-mail-id="${block.id}"><header><strong>${escapeText(mailNames[block.type] || block.type)}</strong><button type="button" data-mail-remove="${block.id}" aria-label="Remover bloco">×</button></header><div class="mail-block-preview">${renderEmailHtml([block])}</div></article>`).join('') : '<p class="tag-empty">Arraste título, texto, botão ou imagem para cá.</p>';
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
  props.innerHTML = selected ? `<h2>${escapeText(mailNames[selected.type])}</h2>${fields.map(control).join('')}` : '<p class="tag-empty">Selecione um bloco para editar.</p>';
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
    const card = sheet.querySelector(`[data-mail-id="${block.id}"] .mail-block-preview`);
    if (card) card.innerHTML = renderEmailHtml([block]);
  }));
}

window.openEmailBuilder = openEmailBuilder;
