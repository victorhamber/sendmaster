// One-recipient email transport adapters ported from the original WordPress plugin.
import { readMailCredentials } from './mailer-settings.js';
import { sendSmtpMessage } from './smtp-transport.js';

export type MailAddress = { email: string; name?: string };
export type OutgoingEmail = { to: MailAddress; subject: string; text: string; html: string; replyTo?: MailAddress; unsubscribeUrl?: string };
export type MailSendResult = { providerId: string; messageId: string | null; accepted: true };
type Credentials = NonNullable<ReturnType<typeof readMailCredentials>>;

const addr = (value: MailAddress) => value.name ? `${value.name} <${value.email}>` : value.email;
const named = (value: MailAddress) => ({ email: value.email, name: value.name ?? '' });

function requestFor(config: Credentials, message: OutgoingEmail): { url: string; headers: Record<string,string>; body: string | FormData } {
  const from = { email: config.senderEmail, name: config.senderName ?? '' };
  const recipient = named(message.to);
  const listHeaders = message.unsubscribeUrl ? {
    'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  } : {};
  const postmarkHeaders = Object.entries(listHeaders).map(([Name, Value]) => ({ Name, Value }));
  const sendLayerHeaders = Object.fromEntries(Object.entries(listHeaders));
  const mailerSendHeaders = Object.entries(listHeaders).map(([name, value]) => ({ name, value }));
  const json = (url: string, headers: Record<string,string>, payload: Record<string,unknown>) => ({ url, headers: { 'content-type':'application/json', ...headers }, body: JSON.stringify(payload) });
  switch (config.providerId) {
    case 'sendlayer':
      return json('https://console.sendlayer.com/api/v1/email', { authorization:`Bearer ${config.apiKey}` }, {
        From:from, To:[recipient], Subject:message.subject, ContentType:'html', HTMLContent:message.html, PlainContent:message.text,
        ...(message.unsubscribeUrl?{Headers:sendLayerHeaders}:{}),
        ...(message.replyTo?{ReplyTo:[named(message.replyTo)]}:{}),
      });
    case 'smtpcom':
      return json('https://api.smtp.com/v4/messages', { authorization:`Bearer ${config.apiKey}`, accept:'application/json' }, {
        ...(config.apiRegion?{channel:config.apiRegion}:{}), originator:{from:{address:from.email,name:from.name}},
        recipients:{to:[{address:message.to.email,name:message.to.name??''}]}, subject:message.subject,
        body:{parts:[{type:'text/plain',content:message.text},{type:'text/html',content:message.html}]},
        ...((message.replyTo||message.unsubscribeUrl)?{internet_headers:{...(message.replyTo?{'Reply-To':addr(message.replyTo)}:{}),...listHeaders}}:{}),
      });
    case 'brevo':
      return json('https://api.brevo.com/v3/smtp/email', { 'api-key':config.apiKey, accept:'application/json' }, {
        sender:from, to:[recipient], subject:message.subject, htmlContent:message.html, textContent:message.text,
        ...(message.unsubscribeUrl?{headers:listHeaders}:{}),
        ...(message.replyTo?{replyTo:named(message.replyTo)}:{}),
      });
    case 'elasticemail':
      return json('https://api.elasticemail.com/v4/emails/transactional', { 'X-ElasticEmail-ApiKey':config.apiKey }, {
        Content:{From:addr(from),Subject:message.subject,Body:[{ContentType:'PlainText',Content:message.text},{ContentType:'HTML',Content:message.html}]},
        Recipients:{To:[addr(message.to)]},
      });
    case 'mailgun': {
      const form = new FormData(); form.set('from',addr(from)); form.set('to',addr(message.to)); form.set('subject',message.subject);
      form.set('text',message.text); form.set('html',message.html);
      if(message.replyTo)form.set('h:Reply-To',addr(message.replyTo));
      if(message.unsubscribeUrl){form.set('h:List-Unsubscribe',`<${message.unsubscribeUrl}>`);form.set('h:List-Unsubscribe-Post','List-Unsubscribe=One-Click')}
      return {url:`https://api.mailgun.net/v3/${encodeURIComponent(config.apiRegion??'')}/messages`,headers:{authorization:`Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`},body:form};
    }
    case 'mailjet':
      return json('https://api.mailjet.com/v3.1/send', { authorization:`Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}` }, {
        Messages:[{From:from,To:[recipient],Subject:message.subject,HTMLPart:message.html,TextPart:message.text,...(message.replyTo?{ReplyTo:named(message.replyTo)}:{}),...(message.unsubscribeUrl?{Headers:listHeaders}:{})}],
      });
    case 'mailersend':
      return json('https://api.mailersend.com/v1/email', { authorization:`Bearer ${config.apiKey}` }, {
        from, to:[recipient], subject:message.subject, html:message.html, text:message.text,
        ...(message.unsubscribeUrl?{list_unsubscribe:`<${message.unsubscribeUrl}>`,headers:mailerSendHeaders}:{}),
        ...(message.replyTo?{reply_to:named(message.replyTo)}:{}),
      });
    case 'mandrill':
      return json('https://mandrillapp.com/api/1.0/messages/send', {}, {
        key:config.apiKey, message:{from_email:from.email,from_name:from.name,to:[{email:message.to.email,name:message.to.name??'',type:'to'}],
          subject:message.subject,html:message.html,text:message.text,...((message.replyTo||message.unsubscribeUrl)?{headers:{...(message.replyTo?{'Reply-To':message.replyTo.email}:{}),...listHeaders}}:{})},
      });
    case 'postmark':
      return json('https://api.postmarkapp.com/email', { 'X-Postmark-Server-Token':config.apiKey, accept:'application/json' }, {
        From:addr(from),To:addr(message.to),Subject:message.subject,HtmlBody:message.html,TextBody:message.text,
        ...(message.unsubscribeUrl?{Headers:postmarkHeaders}:{}),
        ...(message.replyTo?{ReplyTo:addr(message.replyTo)}:{}),
      });
    case 'resend':
      return json('https://api.resend.com/emails', { authorization:`Bearer ${config.apiKey}` }, {
        from:addr(from),to:[addr(message.to)],subject:message.subject,html:message.html,text:message.text,
        ...(message.unsubscribeUrl?{headers:listHeaders}:{}),
        ...(message.replyTo?{reply_to:addr(message.replyTo)}:{}),
      });
    case 'sendgrid':
      return json('https://api.sendgrid.com/v3/mail/send', { authorization:`Bearer ${config.apiKey}` }, {
        from,personalizations:[{to:[recipient]}],subject:message.subject,content:[{type:'text/plain',value:message.text},{type:'text/html',value:message.html}],
        ...(message.unsubscribeUrl?{headers:listHeaders}:{}),
        ...(message.replyTo?{reply_to:named(message.replyTo)}:{}),
      });
    case 'smtp2go':
      return json('https://api.smtp2go.com/v3/email/send', { 'X-Smtp2go-Api-Key':config.apiKey, accept:'application/json' }, {
        sender:addr(from),to:[addr(message.to)],subject:message.subject,html_body:message.html,text_body:message.text,
        ...(message.unsubscribeUrl?{custom_headers:mailerSendHeaders.map(({name,value})=>({header:name,value}))}:{}),
        ...(message.replyTo?{custom_headers:[{header:'Reply-To',value:addr(message.replyTo)}]}:{}),
      });
    case 'sparkpost': {
      const url=(config.apiRegion??'').toLowerCase().includes('eu')?'https://api.eu.sparkpost.com/api/v1/transmissions':'https://api.sparkpost.com/api/v1/transmissions';
      return json(url, { authorization:config.apiKey }, {
        options:{open_tracking:false,click_tracking:false,transactional:true},recipients:[{address:{email:message.to.email,name:message.to.name??''}}],
        content:{from,subject:message.subject,html:message.html,text:message.text,...(message.replyTo?{reply_to:message.replyTo.email}:{}),...(message.unsubscribeUrl?{headers:listHeaders}:{})},
      });
    }
    case 'smtp': throw new Error('SMTP deve ser enviado pelo transporte SMTP.');
  }
}

function responseMessageId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record=body as Record<string,unknown>;
  for (const key of ['messageId','message_id','id','MessageID']) if(typeof record[key]==='string')return record[key] as string;
  if(Array.isArray(body)&&body[0]&&typeof body[0]==='object')return responseMessageId(body[0]);
  return null;
}

export async function sendWorkspaceEmail(workspaceId: string, message: OutgoingEmail): Promise<MailSendResult> {
  if (!message.to.email || !message.subject || !message.text || !message.html) throw new Error('Remetente, destinatário, assunto, texto e HTML são obrigatórios.');
  if (message.unsubscribeUrl) {
    let parsed: URL;
    try { parsed = new URL(message.unsubscribeUrl); } catch { throw new Error('O link de descadastro da campanha é inválido.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || /[\r\n]/.test(message.unsubscribeUrl)) throw new Error('O link de descadastro deve usar HTTPS e ser seguro.');
  }
  const config=readMailCredentials(workspaceId);
  if(!config)throw new Error('Configure um provedor de envio neste workspace antes de enviar.');
  if(config.providerId==='smtp') {
    await sendSmtpMessage(config,message);
    return {providerId:'smtp',messageId:null,accepted:true};
  }
  const request=requestFor(config,message);
  const response=await fetch(request.url,{method:'POST',headers:request.headers,body:request.body,signal:AbortSignal.timeout(30_000)});
  const raw=await response.text();
  let body:unknown=null;
  try{body=raw?JSON.parse(raw):null}catch{body=raw}
  if(!response.ok)throw new Error(`O provedor ${config.providerId} recusou o envio (HTTP ${response.status}). ${typeof body==='string'?body.slice(0,300):''}`.trim());
  return {providerId:config.providerId,messageId:responseMessageId(body),accepted:true};
}
