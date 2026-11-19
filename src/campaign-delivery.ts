// One-recipient campaign delivery seam. Campaign UI remains draft-only until queue and provider webhooks are ready.
import { getCampaignDraft } from './campaigns.js';
import { sendWorkspaceEmail, type MailSendResult } from './mailer.js';
import { createUnsubscribeUrl } from './suppressions.js';
import { db } from './storage.js';

type Recipient = { id: string; email: string; name: string; status: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export async function sendCampaignToContact(workspaceId: string, campaignId: string, contactId: string): Promise<MailSendResult> {
  const baseUrl = process.env.SENDMASTER_PUBLIC_URL ?? '';
  const campaign = getCampaignDraft(workspaceId, campaignId);
  if (!campaign) throw new Error('Rascunho não encontrado neste workspace.');
  const recipient = db.prepare(`SELECT id, email, name, status FROM contacts WHERE id = ? AND workspace_id = ?`)
    .get(contactId, workspaceId) as Recipient | undefined;
  if (!recipient) throw new Error('Contato não encontrado neste workspace.');
  if (recipient.status !== 'confirmed') throw new Error('Somente contatos com consentimento confirmado podem receber campanhas.');
  const unsubscribeUrl = createUnsubscribeUrl(workspaceId, recipient.id, baseUrl);
  const safeUrl = escapeHtml(unsubscribeUrl);
  const html = `${campaign.html}<hr><p style="font-size:12px;color:#59675e">Você está recebendo esta mensagem porque autorizou e-mails deste produto. <a href="${safeUrl}">Cancelar inscrição</a>.</p>`;
  const text = `${campaign.text}\n\nVocê está recebendo esta mensagem porque autorizou e-mails deste produto.\nCancelar inscrição: ${unsubscribeUrl}`;
  return sendWorkspaceEmail(workspaceId, {
    to: { email: recipient.email, name: recipient.name },
    subject: campaign.subject,
    text,
    html,
    unsubscribeUrl,
  });
}
