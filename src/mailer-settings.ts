// Per-workspace mail provider catalog and local connection settings.
import { db } from './storage.js';
import { isProtectedSecret, protectSecret, revealSecret } from './secret-store.js';

export const mailProviders = [
  { id: 'sendlayer', name: 'SendLayer', kind: 'api' },
  { id: 'smtpcom', name: 'SMTP.com', kind: 'api' },
  { id: 'brevo', name: 'Brevo', kind: 'api' },
  { id: 'elasticemail', name: 'Elastic Email', kind: 'api' },
  { id: 'mailgun', name: 'Mailgun', kind: 'api' },
  { id: 'mailjet', name: 'Mailjet', kind: 'api' },
  { id: 'mailersend', name: 'MailerSend', kind: 'api' },
  { id: 'mandrill', name: 'Mandrill', kind: 'api' },
  { id: 'postmark', name: 'Postmark', kind: 'api' },
  { id: 'resend', name: 'Resend', kind: 'api' },
  { id: 'sendgrid', name: 'SendGrid', kind: 'api' },
  { id: 'smtp2go', name: 'SMTP2GO', kind: 'api' },
  { id: 'sparkpost', name: 'SparkPost', kind: 'api' },
  { id: 'smtp', name: 'Outro SMTP', kind: 'smtp' },
] as const;

export type MailProviderId = typeof mailProviders[number]['id'];
export type MailSettingsInput = {
  providerId: MailProviderId; senderEmail: string; senderName: string; replyTo: string;
  apiKey?: string; apiSecret?: string; apiRegion?: string; smtpHost?: string; smtpPort?: number;
  smtpEncryption?: 'none' | 'ssl' | 'tls'; smtpUsername?: string; smtpPassword?: string;
};
type StoredSettings = Omit<MailSettingsInput, 'apiKey' | 'apiSecret' | 'smtpPassword'> & { apiKey?: string; apiSecret?: string; smtpPassword?: string };
const secretFields = ['apiKey', 'apiSecret', 'smtpPassword'] as const;

function readStoredSettings(workspaceId: string, settingsJson: string): StoredSettings {
  const settings = JSON.parse(settingsJson) as StoredSettings;
  let changed = false;
  for (const field of secretFields) {
    const value = settings[field];
    if (value && !isProtectedSecret(value)) { settings[field] = protectSecret(value); changed = true; }
  }
  if (changed) db.prepare('UPDATE workspace_mail_settings SET settings_json = ?, updated_at = ? WHERE workspace_id = ?')
    .run(JSON.stringify(settings), new Date().toISOString(), workspaceId);
  return settings;
}

export function isMailProviderId(value: unknown): value is MailProviderId {
  return typeof value === 'string' && mailProviders.some(provider => provider.id === value);
}

export function getMailSettings(workspaceId: string) {
  const row = db.prepare('SELECT provider_id AS providerId, settings_json AS settingsJson, updated_at AS updatedAt FROM workspace_mail_settings WHERE workspace_id = ?').get(workspaceId) as {providerId:MailProviderId;settingsJson:string;updatedAt:string}|undefined;
  if (!row) return null;
  const { apiKey, apiSecret, smtpPassword, ...settings } = readStoredSettings(workspaceId, row.settingsJson);
  return { ...settings, providerId: row.providerId, apiKeyConfigured: Boolean(apiKey), apiSecretConfigured: Boolean(apiSecret), smtpPasswordConfigured: Boolean(smtpPassword), updatedAt: row.updatedAt };
}

export function readMailCredentials(workspaceId: string) {
  const row = db.prepare('SELECT provider_id AS providerId, settings_json AS settingsJson FROM workspace_mail_settings WHERE workspace_id = ?').get(workspaceId) as {providerId:MailProviderId;settingsJson:string}|undefined;
  if (!row) return null;
  const settings = readStoredSettings(workspaceId, row.settingsJson);
  return { ...settings, apiKey: settings.apiKey ? revealSecret(settings.apiKey) : '', apiSecret: settings.apiSecret ? revealSecret(settings.apiSecret) : '', smtpPassword: settings.smtpPassword ? revealSecret(settings.smtpPassword) : '' };
}

export function saveMailSettings(workspaceId: string, input: MailSettingsInput): boolean {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return false;
  const existing = db.prepare('SELECT provider_id, settings_json FROM workspace_mail_settings WHERE workspace_id = ?').get(workspaceId) as {provider_id:MailProviderId;settings_json:string}|undefined;
  const previous = existing?.provider_id === input.providerId ? readStoredSettings(workspaceId, existing.settings_json) : {} as StoredSettings;
  const secret = (value: string | undefined, old: string | undefined) => value?.trim() ? protectSecret(value.trim()) : old;
  const settings: StoredSettings = {
    providerId: input.providerId, senderEmail: input.senderEmail, senderName: input.senderName, replyTo: input.replyTo,
    apiKey: secret(input.apiKey, previous.apiKey), apiSecret: secret(input.apiSecret, previous.apiSecret),
    apiRegion: input.apiRegion, smtpHost: input.smtpHost, smtpPort: input.smtpPort,
    smtpEncryption: input.smtpEncryption, smtpUsername: input.smtpUsername,
    smtpPassword: secret(input.smtpPassword, previous.smtpPassword),
  };
  db.prepare(`INSERT INTO workspace_mail_settings (workspace_id, provider_id, settings_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET provider_id=excluded.provider_id, settings_json=excluded.settings_json, updated_at=excluded.updated_at`)
    .run(workspaceId, input.providerId, JSON.stringify(settings), new Date().toISOString());
  return true;
}
