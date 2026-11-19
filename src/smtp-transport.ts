// Minimal SMTP transport for the existing generic SMTP configuration.
import { randomUUID } from 'node:crypto';
import { connect as connectNet, type Socket } from 'node:net';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import type { readMailCredentials } from './mailer-settings.js';
import type { OutgoingEmail } from './mailer.js';

type MailCredentials = NonNullable<ReturnType<typeof readMailCredentials>>;
type SmtpSocket = Socket | TLSSocket;

class SmtpConnection {
  private socket: SmtpSocket | null = null;
  private buffer = '';
  private lines: string[] = [];
  private waiters: Array<{resolve:(line:string)=>void;reject:(error:Error)=>void}> = [];
  private failure: Error | null = null;
  private onData = (chunk: Buffer) => {
    this.buffer += chunk.toString('utf8');
    const parts=this.buffer.split(/\r?\n/);this.buffer=parts.pop()??'';
    for(const line of parts){const waiter=this.waiters.shift();if(waiter)waiter.resolve(line);else this.lines.push(line)}
  };
  private onError = (error: Error) => { this.failure=error; for(const waiter of this.waiters.splice(0))waiter.reject(error); };
  private onClose = () => { if(!this.failure)this.onError(new Error('Conexão SMTP encerrada.')); };
  attach(socket:SmtpSocket){this.socket=socket;socket.setTimeout(30_000,()=>socket.destroy(new Error('Tempo limite SMTP excedido.')));socket.on('data',this.onData);socket.on('error',this.onError);socket.on('close',this.onClose)}
  detach():SmtpSocket|null{const socket=this.socket;if(socket){socket.off('data',this.onData);socket.off('error',this.onError);socket.off('close',this.onClose)}this.socket=null;return socket}
  private nextLine():Promise<string>{if(this.lines.length)return Promise.resolve(this.lines.shift()!);if(this.failure)return Promise.reject(this.failure);return new Promise((resolve,reject)=>this.waiters.push({resolve,reject}))}
  async reply():Promise<{code:number;lines:string[]}>{const lines:string[]=[];let code=0;for(;;){const line=await this.nextLine();lines.push(line);const match=line.match(/^(\d{3})([ -])/);if(match){code=Number(match[1]);if(match[2]===' ')return{code,lines}}}}
  async command(value:string,accepted:number[]=[]){if(!this.socket)throw new Error('Conexão SMTP indisponível.');this.socket.write(`${value}\r\n`);const result=await this.reply();if(accepted.length&&!accepted.includes(result.code))throw new Error(`Servidor SMTP respondeu ${result.code}: ${result.lines.at(-1)??''}`);return result}
  write(value:string){if(!this.socket)throw new Error('Conexão SMTP indisponível.');this.socket.write(value)}
  close(){this.socket?.destroy();this.socket=null}
}

function headerValue(value:string):string{return value.replace(/[\r\n]+/g,' ').trim()}
function encodeHeader(value:string):string{const safe=headerValue(value);return /[^\x20-\x7e]/.test(safe)?`=?UTF-8?B?${Buffer.from(safe,'utf8').toString('base64')}?=`:safe}
function address(value:{email:string;name?:string}):string{return value.name?`${encodeHeader(value.name)} <${headerValue(value.email)}>`:headerValue(value.email)}
function base64Lines(value:string):string{return Buffer.from(value,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')??''}

function mimeMessage(config:MailCredentials,message:OutgoingEmail):string{
  const from={email:config.senderEmail,name:config.senderName??''};const reply=message.replyTo??(config.replyTo?{email:config.replyTo}:undefined);
  const headers=[`From: ${address(from)}`,`To: ${address(message.to)}`,`Subject: ${encodeHeader(message.subject)}`,`Date: ${new Date().toUTCString()}`,`Message-ID: <${randomUUID()}@sendmaster.local>`,'MIME-Version: 1.0'];
  if(reply)headers.push(`Reply-To: ${address(reply)}`);
  if(message.unsubscribeUrl){headers.push(`List-Unsubscribe: <${headerValue(message.unsubscribeUrl)}>`,'List-Unsubscribe-Post: List-Unsubscribe=One-Click')}
  if(message.text&&message.html){const boundary=`sendmaster_${randomUUID().replace(/-/g,'')}`;headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);return `${headers.join('\r\n')}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(message.text)}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(message.html)}\r\n--${boundary}--\r\n`}
  const text=message.text||message.html;headers.push(`Content-Type: ${message.html?'text/html':'text/plain'}; charset=UTF-8`,'Content-Transfer-Encoding: base64');return `${headers.join('\r\n')}\r\n\r\n${base64Lines(text)}\r\n`;
}

async function connect(config:MailCredentials,channel:SmtpConnection):Promise<void>{
  const host=config.smtpHost??'';const port=Number(config.smtpPort??587);
  if(config.smtpEncryption==='ssl'){
    const secure=connectTls({host,port,servername:host,rejectUnauthorized:true});channel.attach(secure);await new Promise<void>((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',reject)});
  }else{
    const socket=connectNet({host,port});channel.attach(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject)});
  }
  const greeting=await channel.reply();if(greeting.code!==220)throw new Error(`Servidor SMTP não aceitou conexão (${greeting.code}).`);
  await channel.command('EHLO sendmaster.local',[250]);
  if(config.smtpEncryption==='tls'){
    await channel.command('STARTTLS',[220]);const socket=channel.detach();if(!socket)throw new Error('Conexão SMTP indisponível para STARTTLS.');
    const tls=connectTls({socket,servername:host,rejectUnauthorized:true});
    channel.attach(tls);await new Promise<void>((resolve,reject)=>{tls.once('secureConnect',resolve);tls.once('error',reject)});
    await channel.command('EHLO sendmaster.local',[250]);
  }
}

export async function sendSmtpMessage(config:MailCredentials,message:OutgoingEmail):Promise<void>{
  const channel=new SmtpConnection();
  try{
    await connect(config,channel);
    if(config.smtpUsername||config.smtpPassword){if(!config.smtpUsername||!config.smtpPassword)throw new Error('Informe usuário e senha SMTP juntos.');const plain=Buffer.from(`\0${config.smtpUsername}\0${config.smtpPassword}`).toString('base64');const auth=await channel.command(`AUTH PLAIN ${plain}`);if(auth.code===334)await channel.command(plain,[235]);else if(auth.code!==235){const login=await channel.command('AUTH LOGIN');if(login.code!==334)throw new Error(`Autenticação SMTP recusada (${login.code}).`);const user=await channel.command(Buffer.from(config.smtpUsername).toString('base64'));if(user.code!==334)throw new Error(`Usuário SMTP recusado (${user.code}).`);await channel.command(Buffer.from(config.smtpPassword).toString('base64'),[235])}}
    await channel.command(`MAIL FROM:<${headerValue(config.senderEmail)}>`,[250]);
    await channel.command(`RCPT TO:<${headerValue(message.to.email)}>`,[250,251]);
    await channel.command('DATA',[354]);
    const mime=mimeMessage(config,message).replace(/\r?\n/g,'\r\n').replace(/(^|\r\n)\./g,'$1..');
    channel.write(`${mime}\r\n.\r\n`);const sent=await channel.reply();if(sent.code!==250)throw new Error(`Servidor SMTP recusou a mensagem (${sent.code}).`);
    try{await channel.command('QUIT',[221])}catch{}channel.close();
  }catch(error){channel.close();throw error instanceof Error?error:new Error('Falha ao enviar por SMTP.')}
}
