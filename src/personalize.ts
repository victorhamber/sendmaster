// Troca {{nome}} e {{email}} no momento do envio. HTML recebe texto escapado.
export type Personalization = { nome: string; email: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function personalize(value: string, person: Personalization, html: boolean): string {
  const nome = html ? escapeHtml(person.nome) : person.nome;
  const email = html ? escapeHtml(person.email) : person.email;
  return value.replaceAll('{{nome}}', nome).replaceAll('{{email}}', email);
}

export function withPreheader(html: string, preheader: string): string {
  if (!preheader) return html;
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>${html}`;
}
