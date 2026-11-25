// Caminhos de quem se cadastra. O login administra o sistema e não abre estes endereços.
const FORM_PAGE = /^\/forms\/[0-9a-f-]{36}$/i;
const FORM_SUBMIT = /^\/api\/forms\/[^/]+\/submissions$/;
const WINDOW_MS = 10 * 60 * 1000;
const POST_LIMIT = 20;
const hits = new Map<string, number[]>();

export function isSubscriberRequest(method: string, pathname: string): boolean {
  if ((pathname === '/unsubscribe' || pathname === '/forms/confirm') && (method === 'GET' || method === 'POST')) return true;
  if (method === 'GET' && (pathname === '/mail/open' || pathname === '/mail/click')) return true;
  if (method === 'GET' && FORM_PAGE.test(pathname)) return true;
  return method === 'POST' && FORM_SUBMIT.test(pathname);
}

export function allowPublicPost(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= POST_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
