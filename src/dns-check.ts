// Lê SPF, DMARC e DKIM já publicados. O valor continua vindo do provedor.
import { resolveTxt } from 'node:dns/promises';

export type DnsRecord = { found: boolean; name: string; value: string };
export type DnsCheck = { domain: string; selector: string; spf: DnsRecord; dmarc: DnsRecord; dkim: DnsRecord };

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function firstMatch(rows: string[], marker: string): string {
  return rows.find(row => row.toLowerCase().includes(marker)) ?? '';
}

export function judgeDns(domain: string, selector: string, records: { spf: string[]; dmarc: string[]; dkim: string[] }): DnsCheck {
  const spf = firstMatch(records.spf, 'v=spf1');
  const dmarc = firstMatch(records.dmarc, 'v=dmarc1');
  const dkim = records.dkim.find(row => /v=dkim1|p=/i.test(row)) ?? '';
  return {
    domain, selector,
    spf: { found: Boolean(spf), name: domain, value: spf },
    dmarc: { found: Boolean(dmarc), name: `_dmarc.${domain}`, value: dmarc },
    dkim: { found: Boolean(dkim), name: `${selector}._domainkey.${domain}`, value: dkim },
  };
}

async function textRecords(name: string): Promise<string[]> {
  try { return (await resolveTxt(name)).map(parts => parts.join('')); }
  catch { return []; }
}

export async function lookupDomainAuth(domain: string, selector: string): Promise<DnsCheck | null> {
  const host = domain.trim().toLowerCase().replace(/\.$/, '');
  const key = selector.trim().toLowerCase();
  if (!domainPattern.test(host) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(key)) return null;
  const labels = host.split('.');
  const apex = labels.length > 2 ? labels.slice(1).join('.') : host;
  const [spfRows, dmarcRows, dkimRows] = await Promise.all([
    textRecords(apex), textRecords(`_dmarc.${apex}`), textRecords(`${key}._domainkey.${apex}`),
  ]);
  return judgeDns(apex, key, { spf: spfRows, dmarc: dmarcRows, dkim: dkimRows });
}
