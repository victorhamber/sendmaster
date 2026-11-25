// Monta o HTML do e-mail arrastando blocos. O rascunho guarda o resultado.
let emailBlocks = [];

function blockHtml(block) {
  const text = escapeText(block.text || '');
  const href = /^https:\/\//.test(block.url || '') ? escapeText(block.url) : '#';
  if (block.type === 'title') return `<h1 style="font:700 28px Georgia,serif;color:#20352c">${text || 'Título'}</h1>`;
  if (block.type === 'text') return `<p style="font:16px Georgia,serif;line-height:1.6;color:#304037">${text || 'Texto'}</p>`;
  if (block.type === 'button') return `<p><a href="${href}" style="display:inline-block;padding:12px 18px;background:#176b50;color:#fff;border-radius:7px;text-decoration:none">${text || 'Abrir'}</a></p>`;
  if (block.type === 'image' && href !== '#') return `<p><img src="${href}" alt="" style="max-width:100%;height:auto"></p>`;
  if (block.type === 'divider') return '<hr style="border:0;border-top:1px solid #d7e1da">';
  return '';
}

function emailPlain(block) {
  if (block.type === 'button') return `${block.text || 'Abrir'}${block.url ? `: ${block.url}` : ''}`;
  if (block.type === 'divider' || block.type === 'image') return '';
  return block.text || '';
}

function mountEmailBuilder() {
  const host = document.querySelector('#email-builder');
  if (!host || host.dataset.ready === 'yes') return;
  host.dataset.ready = 'yes';
  emailBlocks = [];
  host.innerHTML = `<div class="email-builder"><aside class="email-palette"><strong>Blocos</strong><button type="button" draggable="true" data-block="title">Título</button><button type="button" draggable="true" data-block="text">Texto</button><button type="button" draggable="true" data-block="button">Botão</button><button type="button" draggable="true" data-block="image">Imagem</button><button type="button" draggable="true" data-block="divider">Divisor</button></aside><div class="email-canvas" id="email-canvas"><p class="tag-empty">Arraste um bloco para cá.</p></div></div><button type="button" class="button secondary" id="email-builder-apply">Usar este layout no HTML</button>`;
  const canvas = host.querySelector('#email-canvas');
  host.querySelectorAll('[data-block]').forEach(button => {
    button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.dataset.block));
  });
  canvas.addEventListener('dragover', event => event.preventDefault());
  canvas.addEventListener('drop', event => {
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain');
    if (!['title', 'text', 'button', 'image', 'divider'].includes(type) || emailBlocks.length >= 20) return;
    emailBlocks.push({ id: `b${Date.now()}`, type, text: '', url: '' });
    drawEmailBlocks();
  });
  host.querySelector('#email-builder-apply').addEventListener('click', () => {
    const form = document.querySelector('#campaign-editor-form');
    if (!form) return;
    form.elements.namedItem('html').value = emailBlocks.map(blockHtml).join('\n');
    form.elements.namedItem('text').value = emailBlocks.map(emailPlain).filter(Boolean).join('\n\n');
    form.dispatchEvent(new Event('input'));
    toast('Layout copiado para o rascunho. Salve a campanha.');
  });
}

function drawEmailBlocks() {
  const canvas = document.querySelector('#email-canvas');
  if (!canvas) return;
  canvas.innerHTML = emailBlocks.length ? emailBlocks.map(block => `<article class="email-block" draggable="true" data-email-block="${block.id}"><header><strong>${escapeText(block.type)}</strong><button type="button" data-email-remove="${block.id}" aria-label="Remover bloco">×</button></header>${block.type === 'divider' ? '' : `<input data-email-text="${block.id}" placeholder="${block.type === 'button' ? 'Texto do botão' : block.type === 'image' ? 'Descrição' : 'Escreva aqui'}" value="${escapeText(block.text || '')}">`}${block.type === 'button' || block.type === 'image' ? `<input data-email-url="${block.id}" placeholder="https://..." value="${escapeText(block.url || '')}">` : ''}</article>`).join('') : '<p class="tag-empty">Arraste um bloco para cá.</p>';
  canvas.querySelectorAll('[data-email-text]').forEach(input => input.addEventListener('input', () => { emailBlocks.find(block => block.id === input.dataset.emailText).text = input.value; }));
  canvas.querySelectorAll('[data-email-url]').forEach(input => input.addEventListener('input', () => { emailBlocks.find(block => block.id === input.dataset.emailUrl).url = input.value; }));
  canvas.querySelectorAll('[data-email-remove]').forEach(button => button.addEventListener('click', () => { emailBlocks = emailBlocks.filter(block => block.id !== button.dataset.emailRemove); drawEmailBlocks(); }));
  canvas.querySelectorAll('[data-email-block]').forEach(card => {
    card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', `move:${card.dataset.emailBlock}`));
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      const moving = event.dataTransfer.getData('text/plain');
      if (!moving.startsWith('move:')) return;
      const id = moving.slice(5);
      const from = emailBlocks.findIndex(block => block.id === id);
      const to = emailBlocks.findIndex(block => block.id === card.dataset.emailBlock);
      if (from < 0 || to < 0 || from === to) return;
      const [item] = emailBlocks.splice(from, 1);
      emailBlocks.splice(to, 0, item);
      drawEmailBlocks();
    });
  });
}
