// Construtor em tela cheia. Os blocos viram o HTML do rascunho.
import { renderEmailHtml, renderEmailText } from './email-layout.js';

const mailPalette = [
  ['Básicos', [['heading', 'Título'], ['text', 'Texto'], ['button', 'Botão'], ['divider', 'Divisor'], ['spacer', 'Espaçador']]],
  ['Mídia', [['image', 'Imagem']]],
  ['Avançado', [['columns', 'Colunas'], ['social', 'Redes sociais'], ['html', 'HTML'], ['footer', 'Rodapé']]],
];
const mailFields = {
  heading: [['text', 'Título', false]],
  text: [['text', 'Texto', true]],
  button: [['text', 'Texto do botão', false], ['url', 'Link https', false]],
  image: [['text', 'Descrição', false], ['url', 'Endereço https da imagem', false]],
  spacer: [['height', 'Altura em pixels', false]],
  columns: [['left', 'Coluna esquerda', true], ['right', 'Coluna direita', true]],
  social: [['url', 'Facebook https', false], ['url2', 'Instagram https', false], ['url3', 'LinkedIn https', false]],
  html: [['html', 'HTML', true]],
  footer: [['text', 'Texto do rodapé', true]],
  divider: [],
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
    const block = { id: `m${Date.now()}`, type, text: '', url: '', url2: '', url3: '', html: '', height: 24, left: '', right: '' };
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
  props.innerHTML = selected ? `<h2>${escapeText(mailNames[selected.type])}</h2>${fields.map(([key, label, area]) => `<label>${label}${area ? `<textarea data-mail-field="${key}">${escapeText(selected[key] || '')}</textarea>` : `<input data-mail-field="${key}" value="${escapeText(selected[key] || '')}">`}</label>`).join('')}` : '<p class="tag-empty">Selecione um bloco para editar.</p>';
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
  props.querySelectorAll('[data-mail-field]').forEach(field => field.addEventListener('input', () => {
    const block = mailBlocks.find(item => item.id === mailSelected);
    if (!block) return;
    block[field.dataset.mailField] = field.value;
    const card = sheet.querySelector(`[data-mail-id="${block.id}"] .mail-block-preview`);
    if (card) card.innerHTML = renderEmailHtml([block]);
  }));
}

window.openEmailBuilder = openEmailBuilder;
