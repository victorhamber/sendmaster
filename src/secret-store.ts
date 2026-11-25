// Protect provider credentials at rest with Windows DPAPI locally, or an env key on servers.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const windowsProtectScript = `$raw=[Console]::In.ReadToEnd().Trim();$bytes=[Convert]::FromBase64String($raw);Add-Type -AssemblyName System.Security;$protected=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($protected))`;
const windowsUnprotectScript = `$raw=[Console]::In.ReadToEnd().Trim();$bytes=[Convert]::FromBase64String($raw);Add-Type -AssemblyName System.Security;$clear=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($clear))`;

function powershell(script: string, input: string, alreadyBase64 = false): string {
  const encodedInput = alreadyBase64 ? input : Buffer.from(input, 'utf8').toString('base64');
  return execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    input: encodedInput, encoding: 'utf8', windowsHide: true, timeout: 10_000,
  }).trim();
}

function envKey(): Buffer {
  const encoded = process.env.SENDMASTER_SECRET_KEY ?? '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Configure SENDMASTER_SECRET_KEY com uma chave Base64 de 32 bytes para proteger credenciais neste servidor.');
  return key;
}

export function isProtectedSecret(value: string): boolean {
  return value.startsWith('dpapi:v1:') || value.startsWith('aesgcm:v1:');
}

export function protectSecret(value: string): string {
  if (process.platform === 'win32') return `dpapi:v1:${powershell(windowsProtectScript, value)}`;
  const key = envKey(); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `aesgcm:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function revealSecret(value: string): string {
  if (value.startsWith('dpapi:v1:')) {
    if (process.platform !== 'win32') throw new Error('Esta credencial foi protegida pelo Windows; informe a chave novamente após migrar para outro sistema.');
    return Buffer.from(powershell(windowsUnprotectScript, value.slice('dpapi:v1:'.length), true), 'base64').toString('utf8');
  }
  if (value.startsWith('aesgcm:v1:')) {
    const [, , ivText, tagText, cipherText] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', envKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()]).toString('utf8');
  }
  return value;
}
