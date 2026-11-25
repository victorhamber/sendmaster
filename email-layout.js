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

function blockRow(inner) {
  return `<tr><td style="padding:12px 28px;font-family:Georgia,serif;color:#20352c">${inner}</td></tr>`;
}

export function renderEmailHtml(blocks) {
  const rows = (Array.isArray(blocks) ? blocks : []).slice(0, 30).map(block => {
    const text = escapeEmail(block.text || '');
    const href = httpsUrl(block.url);
    if (block.type === 'heading') return blockRow(`<h1 style="margin:0;font-size:28px;line-height:1.3">${text || 'Título'}</h1>`);
    if (block.type === 'text') return blockRow(`<p style="margin:0;font-size:16px;line-height:1.6">${text || 'Texto'}</p>`);
    if (block.type === 'button') return blockRow(`<a href="${escapeEmail(href || '#')}" style="display:inline-block;padding:12px 18px;background:#176b50;color:#fff;border-radius:7px;text-decoration:none;font-family:Arial,sans-serif;font-size:15px">${text || 'Abrir'}</a>`);
    if (block.type === 'divider') return blockRow('<hr style="border:0;border-top:1px solid #d7e1da;margin:0">');
    if (block.type === 'spacer') {
      const height = Math.max(8, Math.min(80, Number(block.height) || 24));
      return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0">&nbsp;</td></tr>`;
    }
    if (block.type === 'image' && href) return blockRow(`<img src="${escapeEmail(href)}" alt="${text}" style="max-width:100%;height:auto;border:0">`);
    if (block.type === 'columns') return blockRow(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top" style="padding-right:8px;font-size:15px;line-height:1.5">${escapeEmail(block.left || '')}</td><td width="50%" valign="top" style="padding-left:8px;font-size:15px;line-height:1.5">${escapeEmail(block.right || '')}</td></tr></table>`);
    if (block.type === 'social') {
      const links = [['Facebook', block.url], ['Instagram', block.url2], ['LinkedIn', block.url3]]
        .map(([name, raw]) => (httpsUrl(raw) ? `<a href="${escapeEmail(httpsUrl(raw))}" style="color:#176b50;margin-right:12px;font-family:Arial,sans-serif">${name}</a>` : ''))
        .join('');
      return links ? blockRow(links) : '';
    }
    if (block.type === 'html') return blockRow(cleanHtml(block.html));
    if (block.type === 'footer') return blockRow(`<p style="margin:0;font-size:12px;color:#65736a">${text || 'Você recebe este e-mail porque pediu.'}</p>`);
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
