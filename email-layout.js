// HTML de e-mail a partir de blocos. Só https entra em link e imagem.

function escapeEmail(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function httpsUrl(value) {
  const url = String(value || '').trim();
  return /^https:\/\/[^\s<>"]+$/i.test(url) ? url : '';
}

function cleanHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .slice(0, 8000);
}

const fontStacks = {
  arial: 'Arial, Helvetica, sans-serif',
  georgia: 'Georgia, serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: 'Trebuchet MS, sans-serif',
  courier: 'Courier New, Courier, monospace',
};

function clamp(value, fallback, min, max) {
  const number = Math.round(Number(value));
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function hex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

function fontStack(value) {
  return fontStacks[value] || fontStacks.georgia;
}

function alignOf(block) {
  return ['left', 'center', 'right'].includes(block.align) ? block.align : 'left';
}

function textStyle(block, size, color) {
  const background = hex(block.background, '');
  return `margin:0;font-family:${fontStack(block.font)};font-size:${clamp(block.fontSize, size, 10, 72)}px;line-height:1.5;color:${hex(block.color, color)};font-weight:${block.bold === 'yes' ? 700 : 400};font-style:${block.italic === 'yes' ? 'italic' : 'normal'};text-decoration:${block.underline === 'yes' ? 'underline' : 'none'}${background ? `;background:${background}` : ''}`;
}

function linked(block, inner) {
  const href = httpsUrl(block.url);
  return href ? `<a href="${escapeEmail(href)}" style="color:inherit;text-decoration:inherit">${inner}</a>` : inner;
}

function blockRow(block, inner) {
  const top = clamp(block.marginTop, 12, 0, 80);
  const bottom = clamp(block.marginBottom, 12, 0, 80);
  return `<tr><td style="padding:${top}px 28px ${bottom}px;text-align:${alignOf(block)};font-family:Georgia,serif;color:#20352c">${inner}</td></tr>`;
}

export function renderEmailHtml(blocks) {
  const rows = (Array.isArray(blocks) ? blocks : []).slice(0, 30).map(block => {
    const text = escapeEmail(block.text || '');
    const href = httpsUrl(block.url);
    if (block.type === 'heading') return blockRow(block, linked(block, `<h1 style="${textStyle(block, 32, '#20352c')}">${text || 'Título'}</h1>`));
    if (block.type === 'text') return blockRow(block, linked(block, `<p style="${textStyle(block, 16, '#304037')}">${text || 'Texto'}</p>`));
    if (block.type === 'button') {
      const background = hex(block.background, '#176b50');
      const border = clamp(block.borderWidth, 0, 0, 8);
      return blockRow(block, `<a href="${escapeEmail(href || '#')}" style="display:inline-block;padding:12px 18px;background:${background};color:${hex(block.color, '#ffffff')};border-radius:${clamp(block.radius, 7, 0, 40)}px;border:${border}px solid ${hex(block.borderColor, background)};text-decoration:none;font-family:${fontStack(block.font)};font-size:${clamp(block.fontSize, 16, 10, 32)}px;font-weight:${block.bold === 'yes' ? 700 : 600}">${text || 'Abrir'}</a>`);
    }
    if (block.type === 'divider') return blockRow(block, `<hr style="border:0;border-top:${clamp(block.height, 1, 1, 8)}px solid ${hex(block.color, '#d7e1da')};margin:0">`);
    if (block.type === 'spacer') {
      const height = clamp(block.height, 24, 8, 80);
      return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0">&nbsp;</td></tr>`;
    }
    if (block.type === 'image' && href) {
      const image = `<img src="${escapeEmail(href)}" alt="${text}" style="width:${clamp(block.width, 100, 10, 100)}%;max-width:100%;height:auto;border:0">`;
      const imageLink = httpsUrl(block.link);
      return blockRow(block, imageLink ? `<a href="${escapeEmail(imageLink)}">${image}</a>` : image);
    }
    if (block.type === 'columns') return blockRow(block, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top" style="padding-right:8px;font-size:15px;line-height:1.5">${escapeEmail(block.left || '')}</td><td width="50%" valign="top" style="padding-left:8px;font-size:15px;line-height:1.5">${escapeEmail(block.right || '')}</td></tr></table>`);
    if (block.type === 'social') {
      const links = [['Facebook', block.url], ['Instagram', block.url2], ['LinkedIn', block.url3]]
        .map(([name, raw]) => (httpsUrl(raw) ? `<a href="${escapeEmail(httpsUrl(raw))}" style="color:#176b50;margin-right:12px;font-family:Arial,sans-serif">${name}</a>` : ''))
        .join('');
      return links ? blockRow(block, links) : '';
    }
    if (block.type === 'html') return blockRow(block, cleanHtml(block.html));
    if (block.type === 'footer') return blockRow(block, `<p style="${textStyle(block, 12, '#65736a')}">${text || 'Você recebe este e-mail porque pediu.'}</p>`);
    return '';
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff">${rows}</table>`;
}

export function renderEmailText(blocks) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 30).map(block => {
    if (block.type === 'button') return `${block.text || 'Abrir'}${httpsUrl(block.url) ? `: ${httpsUrl(block.url)}` : ''}`;
    if (block.type === 'image') return httpsUrl(block.url);
    if (block.type === 'columns') return [block.left, block.right].filter(Boolean).join('\n');
    if (block.type === 'social') return [block.url, block.url2, block.url3].map(httpsUrl).filter(Boolean).join('\n');
    if (block.type === 'html') return cleanHtml(block.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (block.type === 'divider' || block.type === 'spacer') return '';
    return block.text || '';
  }).filter(Boolean).join('\n\n');
}
