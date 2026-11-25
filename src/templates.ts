// Modelo reutilizável. A campanha guarda a própria cópia do texto.
import { randomUUID } from 'node:crypto';
import { db } from './storage.js';

export type EmailTemplate = {
  id: string; workspaceId: string; name: string; subject: string; preheader: string; html: string; text: string; createdAt: string; updatedAt: string;
};
type TemplateInput = Pick<EmailTemplate, 'name' | 'subject' | 'preheader' | 'html' | 'text'>;

const select = `SELECT id, workspace_id AS workspaceId, name, subject, preheader, html_body AS html, text_body AS text,
  created_at AS createdAt, updated_at AS updatedAt FROM email_templates`;

export function listEmailTemplates(workspaceId: string): EmailTemplate[] {
  return db.prepare(`${select} WHERE workspace_id = ? ORDER BY updated_at DESC`).all(workspaceId) as EmailTemplate[];
}

export function saveEmailTemplate(workspaceId: string, input: TemplateInput, id?: string): EmailTemplate | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  if (!input.name.trim() || !input.subject.trim()) return null;
  const now = new Date().toISOString();
  const templateId = id ?? randomUUID();
  if (id) {
    const result = db.prepare(`UPDATE email_templates SET name = ?, subject = ?, preheader = ?, html_body = ?, text_body = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?`).run(input.name, input.subject, input.preheader, input.html, input.text, now, id, workspaceId);
    if (!result.changes) return null;
  } else {
    db.prepare(`INSERT INTO email_templates (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(templateId, workspaceId, input.name, input.subject, input.preheader, input.html, input.text, now, now);
  }
  return db.prepare(`${select} WHERE id = ? AND workspace_id = ?`).get(templateId, workspaceId) as EmailTemplate;
}

export function deleteEmailTemplate(workspaceId: string, id: string): boolean {
  return db.prepare('DELETE FROM email_templates WHERE workspace_id = ? AND id = ?').run(workspaceId, id).changes > 0;
}
