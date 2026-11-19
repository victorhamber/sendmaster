// API and static server bound to loopback for personal local use.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSegment, createTag, deleteSegment, deleteTag, listContactSources, listContacts, listSegments, listTags, setContactTags } from './audience.js';
import { createContact, createWorkspace, importContacts, importLegacy, linkContactExternalId, listIntegrationEvents, readState, recordContactResubscription, saveBrief, saveDomains, setActiveWorkspace, updateContactStatus, type Brief, type ContactStatus, type Domains, type SegmentFilters, type Workspace } from './storage.js';
import { confirmSignupToken, deleteSignupForm, getSignupForm, issueSignupConfirmation, listSignupForms, saveSignupForm, submitSignupForm } from './forms.js';
import { sendWorkspaceEmail } from './mailer.js';
import { addCampaignReviewEntry, deleteCampaignDraft, deleteCampaignReviewEntry, listCampaignDrafts, listCampaignReviewEntries, saveCampaignDraft } from './campaigns.js';
import { applyProviderMailEvent, unsubscribeWithToken } from './suppressions.js';
import { getMailSettings, isMailProviderId, mailProviders, saveMailSettings } from './mailer-settings.js';

const root = resolve('.');
const port = Number(process.env.PORT ?? 4173);
const mime: Record<string, string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml' };

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 1_000_000) throw new Error('Payload muito grande.');
  }
  return JSON.parse(raw || '{}') as Record<string, unknown>;
}

async function readText(req: IncomingMessage): Promise<string> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 1_000_000) throw new Error('Payload muito grande.');
  }
  return raw;
}

function validDomain(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] ?? char));
}

function publicFormPage(formId: string): string {
  const form = getSignupForm(formId);
  if (!form) return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Formulário não encontrado</title><p>Este formulário não está disponível.</p></html>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(form.title)}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f8f6;color:#20352c;font:16px system-ui,sans-serif}.card{max-width:520px;margin:32px auto;padding:28px;background:#fff;border:1px solid #dce7e0;border-radius:14px;box-shadow:0 8px 28px #143c2510}h1{font-size:24px;margin:0 0 8px}p{line-height:1.55;color:#52645a}.field{display:grid;gap:7px;margin:17px 0}label{font-weight:600}input[type=email],input[type=text]{width:100%;padding:12px;border:1px solid #abbdb1;border-radius:7px;font:inherit}.consent{display:flex;align-items:flex-start;gap:10px;font-size:14px;font-weight:400}.consent input{margin-top:4px}button{border:0;border-radius:7px;padding:12px 18px;background:#176b50;color:#fff;font:600 15px system-ui;cursor:pointer}button:disabled{opacity:.65}.status{min-height:24px;margin-top:12px;font-size:14px}.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}</style></head><body><main class="card"><h1>${escapeHtml(form.title)}</h1><p>${escapeHtml(form.description)}</p><form id="signup"><div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"></div>${form.collectName?'<div class="field"><label for="name">Nome</label><input id="name" name="name" type="text" autocomplete="name" maxlength="120"></div>':''}<div class="field"><label class="consent"><input name="consent" type="checkbox" required><span>${escapeHtml(form.consentText)}</span></label></div><div class="trap" aria-hidden="true"><label>Não preencher<input name="website" tabindex="-1" autocomplete="off"></label></div><button>${escapeHtml(form.buttonLabel)}</button><div id="status" class="status" role="status" aria-live="polite"></div></form></main><script>
    const form=document.querySelector('#signup'),status=document.querySelector('#status'),button=form.querySelector('button');form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;status.textContent='Enviando cadastro…';try{const values=new FormData(form);const response=await fetch('/api/forms/${form.id}/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:values.get('email'),name:values.get('name')||'',consent:values.get('consent')==='on',website:values.get('website')||''})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível concluir o cadastro.');form.reset();status.textContent=result.message}catch(error){status.textContent=error.message}finally{button.disabled=false}});
  </script></body></html>`;
}

const contactStatuses = new Set<ContactStatus>(['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained']);

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host?.split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return sendJson(res, 403, { error: 'Acesso local apenas.' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: 'Origem não permitida.' });
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') return sendJson(res, 200, readState());
      if (req.method === 'POST' && url.pathname === '/api/legacy/import') { importLegacy(await readJson(req) as never); return sendJson(res, 200, readState()); }
      const signupFormsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/forms$/);
      const signupFormMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/forms\/([^/]+)$/);
      if (signupFormsMatch && req.method === 'GET') return sendJson(res, 200, { forms: listSignupForms(decodeURIComponent(signupFormsMatch[1])) });
      if (signupFormsMatch && req.method === 'POST' || signupFormMatch && req.method === 'PUT') {
        const workspaceId = decodeURIComponent((signupFormsMatch ?? signupFormMatch)![1]);
        const formId = signupFormMatch ? decodeURIComponent(signupFormMatch[2]) : undefined;
        const body = await readJson(req);
        const fields = ['name','title','description','buttonLabel','consentText'] as const;
        const limits = { name:80, title:120, description:300, buttonLabel:40, consentText:300 };
        const values = {} as Record<typeof fields[number], string>;
        for (const field of fields) {
          if (typeof body[field] !== 'string' || body[field].trim().length > limits[field]) return sendJson(res, 400, { error: 'Revise os textos e limites do formulário.' });
          values[field] = body[field].trim();
        }
        if (!values.name || !values.title || !values.consentText) return sendJson(res, 400, { error: 'Nome, título e texto de consentimento são obrigatórios.' });
        if (!Array.isArray(body.tagIds) || body.tagIds.length > 10 || body.tagIds.some(id => typeof id !== 'string')) return sendJson(res, 400, { error: 'Selecione até 10 tags válidas.' });
        if (typeof body.collectName !== 'boolean' || body.doubleOptIn !== undefined && typeof body.doubleOptIn !== 'boolean') return sendJson(res, 400, { error: 'Opções do formulário inválidas.' });
        const form = saveSignupForm(workspaceId, { ...values, collectName: body.collectName, doubleOptIn: body.doubleOptIn !== false, tagIds: body.tagIds as string[] }, formId);
        return form ? sendJson(res, formId ? 200 : 201, { form }) : sendJson(res, 404, { error: 'Workspace ou formulário não encontrado.' });
      }
      if (signupFormMatch && req.method === 'DELETE') return deleteSignupForm(decodeURIComponent(signupFormMatch[1]), decodeURIComponent(signupFormMatch[2])) ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: 'Formulário não encontrado neste workspace.' });
      const mailerMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/mailer$/);
      if (mailerMatch && req.method === 'GET') return sendJson(res, 200, { providers: mailProviders, settings: getMailSettings(decodeURIComponent(mailerMatch[1])) });
      if (mailerMatch && req.method === 'PUT') {
        const workspaceId = decodeURIComponent(mailerMatch[1]); const body = await readJson(req);
        if (!isMailProviderId(body.providerId)) return sendJson(res, 400, { error: 'Selecione um provedor de e-mail disponível.' });
        const senderEmail = typeof body.senderEmail === 'string' ? body.senderEmail.trim().slice(0, 254) : '';
        const senderName = typeof body.senderName === 'string' ? body.senderName.trim().slice(0, 120) : '';
        const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim().slice(0, 254) : '';
        if (!validEmail(senderEmail) || replyTo && !validEmail(replyTo)) return sendJson(res, 400, { error: 'Informe e-mails válidos para remetente e resposta.' });
        const current = getMailSettings(workspaceId);
        const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 1000) : '';
        const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim().slice(0, 1000) : '';
        const apiRegion = typeof body.apiRegion === 'string' ? body.apiRegion.trim().slice(0, 253) : '';
        const sameProvider = current?.providerId === body.providerId;
        if (body.providerId !== 'smtp' && !apiKey && !(sameProvider && current?.apiKeyConfigured)) return sendJson(res, 400, { error: 'Informe a chave de API deste provedor.' });
        if (body.providerId === 'mailjet' && !apiSecret && !(sameProvider && current?.apiSecretConfigured)) return sendJson(res, 400, { error: 'O Mailjet requer a chave secreta da API.' });
        if (['mailgun','smtpcom'].includes(body.providerId) && !apiRegion) return sendJson(res, 400, { error: 'Informe o domínio ou canal exigido por este provedor.' });
        const smtpHost = typeof body.smtpHost === 'string' ? body.smtpHost.trim().slice(0, 253) : '';
        const smtpPort = Number(body.smtpPort ?? 587);
        const smtpEncryption = body.smtpEncryption === 'ssl' || body.smtpEncryption === 'none' ? body.smtpEncryption : 'tls';
        const smtpUsername = typeof body.smtpUsername === 'string' ? body.smtpUsername.trim().slice(0, 254) : '';
        const smtpPassword = typeof body.smtpPassword === 'string' ? body.smtpPassword.slice(0, 1000) : '';
        if (body.providerId === 'smtp' && (!smtpHost || smtpPort < 1 || smtpPort > 65535 || !Number.isInteger(smtpPort))) return sendJson(res, 400, { error: 'Informe servidor e porta SMTP válidos.' });
        const saved = saveMailSettings(workspaceId, { providerId: body.providerId, senderEmail, senderName, replyTo, apiKey, apiSecret,
          apiRegion, smtpHost, smtpPort, smtpEncryption, smtpUsername, smtpPassword });
        return saved ? sendJson(res, 200, { settings: getMailSettings(workspaceId) }) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const submissionMatch = url.pathname.match(/^\/api\/forms\/([^/]+)\/submissions$/);
      if (submissionMatch && req.method === 'POST') {
        const body = await readJson(req);
        if (body.website) return sendJson(res, 201, { accepted: true, message: 'Cadastro recebido.' });
        if (body.consent !== true) return sendJson(res, 400, { error: 'Marque o consentimento para continuar.' });
        if (!validEmail(body.email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
        if (typeof body.name === 'string' && body.name.length > 120) return sendJson(res, 400, { error: 'Nome muito longo.' });
        const result = submitSignupForm(decodeURIComponent(submissionMatch[1]), body.email.trim(), typeof body.name === 'string' ? body.name.trim() : '');
        if (!result) return sendJson(res, 404, { error: 'Formulário não encontrado.' });
        if (result.doubleOptIn) {
          const form = getSignupForm(decodeURIComponent(submissionMatch[1]));
          const issued = issueSignupConfirmation(decodeURIComponent(submissionMatch[1]), result.contact.id);
          if (!form || !issued) return sendJson(res, 500, { error: 'Não foi possível preparar a confirmação.' });
          const confirmationUrl = `http://${req.headers.host}/forms/confirm?token=${encodeURIComponent(issued.token)}`;
          const greeting = result.contact.name ? `Olá, ${result.contact.name}!` : 'Olá!';
          const subject = `Confirme sua inscrição: ${form.title}`;
          const text = `${greeting}\n\nRecebemos seu pedido de inscrição. Para confirmar que este endereço é seu e autorizar o recebimento dos e-mails, abra o link abaixo:\n\n${confirmationUrl}\n\nO link expira em 24 horas. Se você não solicitou esta inscrição, ignore esta mensagem.`;
          const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><p>${escapeHtml(greeting)}</p><p>Recebemos seu pedido de inscrição em <strong>${escapeHtml(form.title)}</strong>. Confirme que este endereço é seu e autorize o recebimento dos e-mails:</p><p><a href="${escapeHtml(confirmationUrl)}">Confirmar minha inscrição</a></p><p>O link expira em 24 horas. Se você não solicitou esta inscrição, ignore esta mensagem.</p></html>`;
          try {
            await sendWorkspaceEmail(result.contact.workspaceId, { to: { email: result.contact.email, name: result.contact.name }, subject, text, html });
          } catch (error) {
            console.error('Falha ao enviar confirmação de cadastro:', error instanceof Error ? error.message : 'erro desconhecido');
            return sendJson(res, 503, { status: 'pending', error: 'O cadastro ficou pendente, mas não conseguimos enviar o e-mail de confirmação. Verifique o provedor de envio e tente novamente mais tarde.' });
          }
          return sendJson(res, 201, { status: 'pending', message: 'Cadastro recebido. Enviamos um e-mail com o link para confirmar sua inscrição.' });
        }
        return sendJson(res, 201, { status: result.contact.status, message: 'Cadastro confirmado com opt-in simples. O envio de campanhas ainda não está conectado.' });
      }
      const campaignsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/campaigns$/);
      const campaignMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/campaigns\/([^/]+)$/);
      if (campaignsMatch && req.method === 'GET') return sendJson(res, 200, { campaigns: listCampaignDrafts(decodeURIComponent(campaignsMatch[1])) });
      if ((campaignsMatch && req.method === 'POST') || (campaignMatch && req.method === 'PUT')) {
        const workspaceId = decodeURIComponent((campaignsMatch ?? campaignMatch)![1]);
        const campaignId = campaignMatch ? decodeURIComponent(campaignMatch[2]) : undefined;
        const body = await readJson(req);
        const fields = ['name', 'subject', 'preheader', 'html', 'text'] as const;
        const limits = { name: 100, subject: 180, preheader: 180, html: 200_000, text: 200_000 };
        const values = {} as Record<typeof fields[number], string>;
        for (const field of fields) {
          if (typeof body[field] !== 'string' || body[field].length > limits[field]) return sendJson(res, 400, { error: 'Revise os campos ou os limites do rascunho.' });
          values[field] = body[field].trim();
        }
        if (!values.name || !values.subject) return sendJson(res, 400, { error: 'Informe o nome da campanha e o assunto do e-mail.' });
        const campaign = saveCampaignDraft(workspaceId, values, campaignId);
        return campaign ? sendJson(res, campaignId ? 200 : 201, { campaign }) : sendJson(res, 404, { error: 'Workspace ou rascunho não encontrado.' });
      }
      if (campaignMatch && req.method === 'DELETE') return deleteCampaignDraft(decodeURIComponent(campaignMatch[1]), decodeURIComponent(campaignMatch[2]))
        ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: 'Rascunho não encontrado neste workspace.' });
      const campaignReviewMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/campaign-review$/);
      const campaignReviewItemMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/campaign-review\/([^/]+)$/);
      if (campaignReviewMatch && req.method === 'GET') {
        const workspaceId = decodeURIComponent(campaignReviewMatch[1]);
        return sendJson(res, 200, { entries: listCampaignReviewEntries(workspaceId), segments: listSegments(workspaceId) });
      }
      if (campaignReviewMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(campaignReviewMatch[1]); const body = await readJson(req);
        if (typeof body.campaignId !== 'string' || body.segmentId !== null && typeof body.segmentId !== 'string') return sendJson(res, 400, { error: 'Campanha ou segmento inválido.' });
        const entry = addCampaignReviewEntry(workspaceId, body.campaignId, typeof body.segmentId === 'string' ? body.segmentId : null);
        return entry ? sendJson(res, 201, { entry }) : sendJson(res, 404, { error: 'Rascunho não encontrado neste workspace.' });
      }
      if (campaignReviewItemMatch && req.method === 'DELETE') return deleteCampaignReviewEntry(decodeURIComponent(campaignReviewItemMatch[1]), decodeURIComponent(campaignReviewItemMatch[2]))
        ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: 'Item de revisão não encontrado neste workspace.' });
      const mailEventsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/mail-events$/);
      if (mailEventsMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(mailEventsMatch[1]); const body = await readJson(req);
        const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
        const providerEventId = typeof body.providerEventId === 'string' ? body.providerEventId.trim().slice(0, 200) : '';
        if (!/^[a-z0-9_-]{2,40}$/.test(provider) || !providerEventId || typeof body.email !== 'string' || !validEmail(body.email) || !['bounce','complaint'].includes(String(body.signal))) {
          return sendJson(res, 400, { error: 'Evento de e-mail inválido. Informe provedor, ID único, e-mail e tipo bounce ou complaint.' });
        }
        const result = applyProviderMailEvent({ workspaceId, provider, providerEventId, email: body.email, signal: body.signal as 'bounce' | 'complaint' });
        return result ? sendJson(res, 202, result) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/workspaces') {
        const body = await readJson(req); const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 80) return sendJson(res, 400, { error: 'Nome do workspace inválido.' });
        const workspace: Workspace = { id: randomUUID(), name, product: typeof body.product === 'string' ? body.product.trim().slice(0, 120) : '', createdAt: new Date().toISOString() };
        createWorkspace(workspace); setActiveWorkspace(workspace.id); return sendJson(res, 201, { workspace, state: readState() });
      }
      const activeMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/active$/);
      if (req.method === 'PUT' && activeMatch) {
        const id = decodeURIComponent(activeMatch[1]); return setActiveWorkspace(id) ? sendJson(res, 200, readState()) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const briefMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/briefs$/);
      if (req.method === 'POST' && briefMatch) {
        const id = decodeURIComponent(briefMatch[1]); const body = await readJson(req);
        if (typeof body.name !== 'string' || !body.name.trim() || typeof body.data !== 'object' || body.data === null) return sendJson(res, 400, { error: 'Brief inválido.' });
        const brief: Brief = { id: typeof body.id === 'string' ? body.id : randomUUID(), name: body.name.trim().slice(0, 100), data: body.data as Record<string,string>, updatedAt: new Date().toISOString() };
        return saveBrief(id, brief) ? sendJson(res, 201, { brief }) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const domainsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/domains$/);
      if (req.method === 'PUT' && domainsMatch) {
        const id = decodeURIComponent(domainsMatch[1]); const body = await readJson(req);
        if (!validDomain(body.sending) || !validDomain(body.tracking)) return sendJson(res, 400, { error: 'Informe domínios válidos.' });
        const domains: Domains = { sending: body.sending.toLowerCase(), tracking: body.tracking.toLowerCase() };
        return saveDomains(id, domains) ? sendJson(res, 200, { domains }) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const contactsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts$/);
      const contactImportMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts\/import$/);
      const tagsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/tags$/);
      if (tagsMatch && req.method === 'GET') return sendJson(res, 200, { tags: listTags(decodeURIComponent(tagsMatch[1])) });
      const sourcesMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contact-sources$/);
      if (sourcesMatch && req.method === 'GET') return sendJson(res, 200, { sources: listContactSources(decodeURIComponent(sourcesMatch[1])) });
      if (tagsMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(tagsMatch[1]); const body = await readJson(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 40) return sendJson(res, 400, { error: 'A tag precisa ter entre 1 e 40 caracteres.' });
        const tag = createTag(workspaceId, name);
        return tag ? sendJson(res, 201, { tag }) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const tagMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/tags\/([^/]+)$/);
      if (tagMatch && req.method === 'DELETE') {
        const workspaceId = decodeURIComponent(tagMatch[1]); const tagId = decodeURIComponent(tagMatch[2]);
        return deleteTag(workspaceId, tagId) ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: 'Tag não encontrada neste workspace.' });
      }
      const segmentMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/segments$/);
      if (segmentMatch && req.method === 'GET') return sendJson(res, 200, { segments: listSegments(decodeURIComponent(segmentMatch[1])) });
      if (segmentMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(segmentMatch[1]); const body = await readJson(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const filters = body.filters as Partial<SegmentFilters> | undefined;
        if (!name || name.length > 80 || !filters || typeof filters !== 'object') return sendJson(res, 400, { error: 'Informe o nome e os filtros do segmento.' });
        const status = typeof filters.status === 'string' && contactStatuses.has(filters.status as ContactStatus) ? filters.status as ContactStatus : '';
        const safeFilters: SegmentFilters = { search: typeof filters.search === 'string' ? filters.search.trim().slice(0, 120) : '', status, source: typeof filters.source === 'string' ? filters.source.trim().slice(0, 120) : '', tagId: typeof filters.tagId === 'string' ? filters.tagId.slice(0, 80) : '' };
        const segment = createSegment(workspaceId, name, safeFilters);
        return segment ? sendJson(res, 201, { segment }) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      const segmentIdMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/segments\/([^/]+)$/);
      if (segmentIdMatch && req.method === 'DELETE') {
        const workspaceId = decodeURIComponent(segmentIdMatch[1]); const segmentId = decodeURIComponent(segmentIdMatch[2]);
        return deleteSegment(workspaceId, segmentId) ? sendJson(res, 200, { deleted: true }) : sendJson(res, 404, { error: 'Segmento não encontrado neste workspace.' });
      }
      const contactTagsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts\/([^/]+)\/tags$/);
      if (contactTagsMatch && req.method === 'PUT') {
        const workspaceId = decodeURIComponent(contactTagsMatch[1]); const contactId = decodeURIComponent(contactTagsMatch[2]); const body = await readJson(req);
        if (!Array.isArray(body.tagIds) || body.tagIds.length > 100 || body.tagIds.some(id => typeof id !== 'string')) return sendJson(res, 400, { error: 'Lista de tags inválida.' });
        const tags = setContactTags(workspaceId, contactId, body.tagIds as string[]);
        return tags ? sendJson(res, 200, { tags }) : sendJson(res, 404, { error: 'Contato não encontrado neste workspace.' });
      }
      if (contactImportMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(contactImportMatch[1]); const body = await readJson(req);
        if (!Array.isArray(body.contacts) || body.contacts.length > 1000) return sendJson(res, 400, { error: 'Importe até 1.000 contatos por arquivo.' });
        const rows: Array<{ email: string; name: string; source: string }> = [];
        for (const row of body.contacts) {
          if (!row || typeof row !== 'object' || !validEmail(row.email)) return sendJson(res, 400, { error: 'O arquivo contém um e-mail inválido.' });
          rows.push({ email: row.email.trim(), name: typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '', source: typeof row.source === 'string' ? row.source.trim().slice(0, 120) : 'importação CSV' });
        }
        const result = importContacts(workspaceId, rows);
        return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'Workspace não encontrado.' });
      }
      if (contactsMatch && req.method === 'GET') {
        const workspaceId = decodeURIComponent(contactsMatch[1]);
        const statusValue = url.searchParams.get('status') ?? '';
        if (statusValue && !contactStatuses.has(statusValue as ContactStatus)) return sendJson(res, 400, { error: 'Filtro de status inválido.' });
        const filters: SegmentFilters = { search: (url.searchParams.get('q') ?? '').slice(0, 120), status: statusValue as ContactStatus | '', source: (url.searchParams.get('source') ?? '').slice(0, 120), tagId: (url.searchParams.get('tagId') ?? '').slice(0, 80) };
        return sendJson(res, 200, { contacts: listContacts(workspaceId, filters) });
      }
      if (contactsMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(contactsMatch[1]); const body = await readJson(req);
        if (!validEmail(body.email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
        const status = typeof body.status === 'string' && contactStatuses.has(body.status as ContactStatus) ? body.status as ContactStatus : 'pending';
        const consentEvidence = typeof body.consentEvidence === 'string' ? body.consentEvidence.trim().slice(0, 240) : '';
        if (status === 'confirmed' && !consentEvidence) return sendJson(res, 400, { error: 'Registre a origem do consentimento antes de ativar o contato.' });
        const contact = createContact({ id: randomUUID(), workspaceId, email: body.email.trim(), name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '', source: typeof body.source === 'string' ? body.source.trim().slice(0, 120) : 'manual', status, consentAt: status === 'confirmed' ? new Date().toISOString() : null, consentEvidence });
        if (!contact) return sendJson(res, 404, { error: 'Workspace não encontrado.' });
        return sendJson(res, 201, { contact });
      }
      const contactStatusMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts\/([^/]+)\/status$/);
      if (contactStatusMatch && req.method === 'PUT') {
        const workspaceId = decodeURIComponent(contactStatusMatch[1]); const contactId = decodeURIComponent(contactStatusMatch[2]); const body = await readJson(req);
        if (typeof body.status !== 'string' || !contactStatuses.has(body.status as ContactStatus)) return sendJson(res, 400, { error: 'Status de contato inválido.' });
        const evidence = typeof body.consentEvidence === 'string' ? body.consentEvidence.trim().slice(0, 240) : '';
        if (body.status === 'confirmed' && !evidence) return sendJson(res, 400, { error: 'É necessário registrar consentimento válido para reativar.' });
        const contact = updateContactStatus(workspaceId, contactId, body.status as ContactStatus, evidence);
        return contact ? sendJson(res, 200, { contact }) : sendJson(res, 404, { error: 'Contato não encontrado neste workspace.' });
      }
      const resubscribeMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts\/([^/]+)\/resubscribe$/);
      if (resubscribeMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(resubscribeMatch[1]); const contactId = decodeURIComponent(resubscribeMatch[2]); const body = await readJson(req);
        const evidence = typeof body.consentEvidence === 'string' ? body.consentEvidence.trim().slice(0, 240) : '';
        if (evidence.length < 8) return sendJson(res, 400, { error: 'Informe como e quando a pessoa deu o novo consentimento.' });
        const contact = recordContactResubscription(workspaceId, contactId, evidence);
        return contact ? sendJson(res, 200, { contact }) : sendJson(res, 409, { error: 'Este contato não está suprimido ou não pertence ao workspace.' });
      }
      const externalIdMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/contacts\/([^/]+)\/external-ids$/);
      if (externalIdMatch && req.method === 'POST') {
        const workspaceId = decodeURIComponent(externalIdMatch[1]); const contactId = decodeURIComponent(externalIdMatch[2]); const body = await readJson(req);
        const system = typeof body.system === 'string' ? body.system.trim().toLowerCase() : '';
        const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : '';
        if (!/^[a-z0-9_-]{2,40}$/.test(system) || !externalId || externalId.length > 200) return sendJson(res, 400, { error: 'Identificador externo inválido.' });
        return linkContactExternalId(workspaceId, contactId, system, externalId) ? sendJson(res, 201, { linked: true }) : sendJson(res, 404, { error: 'Contato não encontrado neste workspace.' });
      }
      const eventsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/integration-events$/);
      if (eventsMatch && req.method === 'GET') {
        const workspaceId = decodeURIComponent(eventsMatch[1]); const afterId = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0);
        return sendJson(res, 200, { events: listIntegrationEvents(workspaceId, afterId) });
      }
      return sendJson(res, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: contacts')) return sendJson(res, 409, { error: 'Este e-mail já existe neste workspace.' });
      if (error instanceof Error && (error.message.includes('UNIQUE constraint failed: workspace_tags') || error.message.includes('UNIQUE constraint failed: audience_segments'))) return sendJson(res, 409, { error: 'Já existe uma tag ou segmento com esse nome neste workspace.' });
      return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Requisição inválida.' });
    }
  }
  if (url.pathname === '/unsubscribe' && req.method === 'GET') {
    const token = url.searchParams.get('token') ?? '';
    const safeToken = /^[A-Za-z0-9_-]{40,50}$/.test(token) ? token : '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preferências de e-mail</title><style>body{margin:0;padding:24px;background:#f5f8f6;color:#20352c;font:16px system-ui,sans-serif}.card{max-width:520px;margin:48px auto;padding:28px;background:#fff;border:1px solid #dce7e0;border-radius:14px}button{border:0;border-radius:7px;padding:12px 18px;background:#176b50;color:#fff;font:600 15px system-ui;cursor:pointer}.status{min-height:24px;margin-top:16px;color:#52645a}</style></head><body><main class="card"><h1>Cancelar inscrição</h1><p>Você pode parar de receber e-mails deste produto. A solicitação só será aplicada após confirmar abaixo.</p><button id="unsubscribe">Cancelar inscrição</button><p id="status" class="status" role="status" aria-live="polite"></p></main><script>const button=document.querySelector('#unsubscribe'),status=document.querySelector('#status');button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Processando…';try{const response=await fetch('/unsubscribe?token=${safeToken}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'${safeToken}'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Link inválido.');button.hidden=true;status.textContent=result.message}catch(error){status.textContent=error.message;button.disabled=false}});</script></body></html>`);
    return;
  }
  if (url.pathname === '/unsubscribe' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
      let token = url.searchParams.get('token') ?? '';
      if (contentType === 'application/x-www-form-urlencoded') {
        const fields = new URLSearchParams(await readText(req));
        if (fields.get('List-Unsubscribe') !== 'One-Click') return sendJson(res, 400, { error: 'Solicitação de descadastro inválida.' });
      } else {
        const body = await readJson(req);
        if (typeof body.token === 'string') token = body.token;
      }
      return unsubscribeWithToken(token)
        ? sendJson(res, 200, { status: 'unsubscribed', message: 'Inscrição cancelada. Você não receberá mais estas campanhas.' })
        : sendJson(res, 400, { error: 'Link de descadastro inválido.' });
    } catch { return sendJson(res, 400, { error: 'Não foi possível processar o descadastro.' }); }
  }
  if (url.pathname === '/forms/confirm' && req.method === 'GET') {
    const token = url.searchParams.get('token') ?? '';
    const safeToken = /^[A-Za-z0-9_-]{40,50}$/.test(token) ? token : '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar inscrição</title><style>body{margin:0;padding:24px;background:#f5f8f6;color:#20352c;font:16px system-ui,sans-serif}.card{max-width:520px;margin:48px auto;padding:28px;background:#fff;border:1px solid #dce7e0;border-radius:14px}button{border:0;border-radius:7px;padding:12px 18px;background:#176b50;color:#fff;font:600 15px system-ui;cursor:pointer}.status{min-height:24px;margin-top:16px;color:#52645a}</style></head><body><main class="card"><h1>Confirme sua inscrição</h1><p>Confirme que você pediu para receber e-mails. A inscrição só será ativada depois desta etapa.</p><button id="confirm">Confirmar inscrição</button><p id="status" class="status" role="status" aria-live="polite"></p></main><script>const button=document.querySelector('#confirm'),status=document.querySelector('#status');button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Confirmando…';try{const response=await fetch('/forms/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'${safeToken}'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Link inválido ou expirado.');button.hidden=true;status.textContent=result.message}catch(error){status.textContent=error.message;button.disabled=false}});</script></body></html>`);
    return;
  }
  if (url.pathname === '/forms/confirm' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (typeof body.token !== 'string') return sendJson(res, 400, { error: 'Link inválido ou expirado.' });
      return confirmSignupToken(body.token)
        ? sendJson(res, 200, { status: 'confirmed', message: 'Inscrição confirmada. Você já pode fechar esta página.' })
        : sendJson(res, 400, { error: 'Link inválido, expirado ou já utilizado.' });
    } catch { return sendJson(res, 400, { error: 'Não foi possível confirmar a inscrição.' }); }
  }
  const publicFormMatch = url.pathname.match(/^\/forms\/([a-f0-9-]{36})$/i);
  if (publicFormMatch && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(publicFormPage(publicFormMatch[1]));
    return;
  }
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = resolve(root, `.${relative}`);
  if (file !== root && !file.startsWith(root + sep)) return sendJson(res, 404, { error: 'Arquivo não encontrado.' });
  if (relative.split('/').some(part => part.startsWith('.') || part === 'data' || part === 'src')) return sendJson(res, 404, { error: 'Arquivo não encontrado.' });
  try { res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file)); }
  catch { if (!res.headersSent) sendJson(res, 404, { error: 'Arquivo não encontrado.' }); else if (!res.destroyed && !res.writableEnded) res.end(); }
}

createServer((req, res) => { void route(req, res).catch(() => { if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' }); else if (!res.destroyed && !res.writableEnded) res.end(); }); })
  .listen(port, '127.0.0.1', () => console.log(`SendMaster local em http://127.0.0.1:${port}`));
