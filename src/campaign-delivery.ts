// Envio de um destinatário. Quem chama é o worker da fila, nunca o request HTTP.
import { getCampaignDraft } from './campaigns.js';
import { sendWorkspaceEmail, type MailSendResult } from './mailer.js';
import { createUnsubscribeUrl } from './suppressions.js';
import { personalize, withPreheader } from './personalize.js';
import { trackMessage } from './tracking.js';
import { db } from './storage.js';

type Recipient = { id: string; email: string; name: string; status: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export async function sendCampaignToContact(workspaceId: string, campaignId: string, contactId: string, messageId: string): Promise<MailSendResult> {
  const baseUrl = process.env.SENDMASTER_PUBLIC_URL ?? '';
  const campaign = getCampaignDraft(workspaceId, campaignId);
  if (!campaign) throw new Error('Rascunho não encontrado neste workspace.');
  const recipient = db.prepare(`SELECT id, email, name, status FROM contacts WHERE id = ? AND workspace_id = ?`)
    .get(contactId, workspaceId) as Recipient | undefined;
  if (!recipient) throw new Error('Contato não encontrado neste workspace.');
  if (recipient.status !== 'confirmed') throw new Error('Somente contatos com consentimento confirmado podem receber campanhas.');
  const person = { nome: recipient.name, email: recipient.email };
  const unsubscribeUrl = createUnsubscribeUrl(workspaceId, recipient.id, baseUrl);
  const safeUrl = escapeHtml(unsubscribeUrl);
  const tracked = trackMessage(messageId, withPreheader(personalize(campaign.html, person, true), personalize(campaign.preheader, person, true)), personalize(campaign.text, person, false), baseUrl);
  const hasFooterLink = tracked.html.includes('{{descadastro}}') || tracked.text.includes('{{descadastro}}');
  const html = hasFooterLink ? tracked.html.replaceAll('{{descadastro}}', safeUrl) : `${tracked.html}<hr><p style="font-size:12px;color:#59675e">Você está recebendo esta mensagem porque autorizou e-mails deste produto. <a href="${safeUrl}">Cancelar inscrição</a>.</p>`;
  const text = hasFooterLink ? tracked.text.replaceAll('{{descadastro}}', unsubscribeUrl) : `${tracked.text}\n\nVocê está recebendo esta mensagem porque autorizou e-mails deste produto.\nCancelar inscrição: ${unsubscribeUrl}`;
  return sendWorkspaceEmail(workspaceId, {
    to: { email: recipient.email, name: recipient.name },
    subject: personalize(campaign.subject, person, false),
    text,
    html,
    unsubscribeUrl,
  });
}
