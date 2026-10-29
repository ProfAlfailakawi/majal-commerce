/**
 * «نُحدّث البرنامج» بدل صفحة Google الإنجليزية أثناء النشر.
 *
 *   U1) sw.js: التنقّل بـ 500/502/503/504، أو بانقطاعٍ والجهاز متّصل ← صفحة التحديث (503، no-store)
 *       بسياستها (CSP)؛ والنجاح والتحويل يمرّان كما هما.
 *   U2) لا يمسّ /api ولا غير GET ولا غير التنقّل، ولا يحفظ أيّ 5xx في أيّ ذاكرة؛ ودون اتصال
 *       حقيقي يبقى الهيكل المحفوظ.
 *   U3) التثبيت يحفظ الصفحة في ذاكرة ثابتة يُبقيها التفعيل، وتُعاد بعد تنقّلٍ ناجح إن مُسحت؛
 *       وبصمة البناء باقية.
 *   U4) الصفحة: مستقلّة بلا رابط خارجي، RTL، نهاري/ليلي، تسأل /api/ready كل ٣ ثوانٍ
 *       وتتباطأ، وتعيد فتح الرابط نفسه، ولا تدور في حلقة.
 *   U5) CSP الصفحة تسمح ببصمة سكربتها وحده، والخادم يرسلها لهذا الملف وحده.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { updatingPageCsp } from './updating-page';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const ORIGIN = 'https://majal.web.app';
const PAGE = read('public/updating.html');
const CSP = updatingPageCsp(PAGE)!;
const GOOGLE_502 = '<html><title>Error 502 (Server Error)!!1</title><p>Error: Server Error. Please try again in 30 seconds.</p></html>';
const pathOf = (key: any) => new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
const pageResponse = () => html(PAGE, 200, { 'Content-Security-Policy': CSP });

type Net = (pathname: string) => Promise<Response>;

/** sw.js in a sandbox with an in-memory Cache Storage that records every write. */
function worker(net: Net, options: { online?: boolean } = {}) {
  const handlers: Record<string, (event: any) => void> = {};
  const store = new Map<string, Map<string, Response>>();
  const writes: Array<{ cache: string; key: string; status: number }> = [];
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      put: async (key: any, response: Response) => { writes.push({ cache: name, key: pathOf(key), status: response.status }); entries.set(pathOf(key), response.clone()); },
      match: async (key: any) => entries.get(pathOf(key))?.clone(),
      add: async (key: any) => { const r = await net(pathOf(key)); if (!r.ok) throw new TypeError('bad'); writes.push({ cache: name, key: pathOf(key), status: r.status }); entries.set(pathOf(key), r); },
    };
  };
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (key: any) => { for (const entries of store.values()) { const hit = entries.get(pathOf(key)); if (hit) return hit.clone(); } return undefined; },
  };
  const self: any = {
    addEventListener: (type: string, fn: any) => { handlers[type] = fn; },
    location: { origin: ORIGIN }, skipWaiting() {}, clients: { claim() {} },
    navigator: { onLine: options.online ?? true },
  };
  vm.runInNewContext(read('public/sw.js'), { self, URL, Response, Promise, caches, fetch: (request: any) => net(pathOf(request)) });
  const lifecycle = async (type: string) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = async (pathname: string, init: { mode?: string; method?: string } = {}) => {
    let answer: Promise<Response> | null = null;
    handlers.fetch({
      request: { url: `${ORIGIN}${pathname}`, mode: init.mode ?? 'navigate', method: init.method ?? 'GET' },
      respondWith: (p: Promise<Response>) => { answer = p; },
    });
    let response: Response | null = null, error: unknown = null;
    try { response = answer ? await answer : null; } catch (e) { error = e; }
    await tick(); await tick();
    return { answered: answer !== null, response, error };
  };
  return { lifecycle, request, store, writes, open };
}

/** The network as the platform answers mid-deploy; the page itself is still reachable for install. */
const deploying = (status: number | 'drop'): Net => async pathname => {
  if (pathname === '/updating.html') return pageResponse();
  if (status === 'drop') throw new TypeError('Failed to fetch');
  return html(GOOGLE_502, status);
};
const isUpdatingPage = async (response: Response | null) =>
  Boolean(response) && response!.status === 503 && response!.headers.get('cache-control') === 'no-store'
  && /text\/html/.test(response!.headers.get('content-type') || '') && response!.headers.get('content-security-policy') === CSP
  && (await response!.clone().text()).includes('نُحدّث البرنامج الآن');

test('U1 navigation answered 500/502/503/504 gets the updating page (503, no-store, its CSP)', async () => {
  for (const status of [500, 502, 503, 504]) {
    const sw = worker(deploying(status));
    await sw.lifecycle('install');
    for (const route of ['/', '/marketplace', '/showcase/abc']) {
      assert.ok(await isUpdatingPage((await sw.request(route)).response), `${status} ${route}`);
    }
  }
});

test('U1 a dropped navigation while the device is online gets the updating page', async () => {
  const sw = worker(deploying('drop'));
  await sw.lifecycle('install');
  assert.ok(await isUpdatingPage((await sw.request('/marketplace')).response));
});

test('U1 success and redirects pass through untouched', async () => {
  const sw = worker(async pathname => (pathname === '/updating.html' ? pageResponse() : html(`<p>${pathname}</p>`)));
  await sw.lifecycle('install');
  const ok = await sw.request('/marketplace');
  assert.equal(ok.response?.status, 200);
  assert.equal(await ok.response!.text(), '<p>/marketplace</p>');
  const redirect = worker(async () => new Response(null, { status: 302, headers: { Location: '/' } }));
  assert.equal((await redirect.request('/old')).response?.status, 302);
});

test('U2 /api, non-GET and non-navigation requests are never swapped', async () => {
  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  assert.equal((await sw.request('/api/v1/domain/snapshot', { mode: 'cors' })).answered, false);
  assert.equal((await sw.request('/api/v1/payments/statement.csv')).answered, false);
  assert.equal((await sw.request('/marketplace', { method: 'POST' })).answered, false);
  const font = await sw.request('/fonts/unknown.woff2', { mode: 'no-cors' });
  assert.equal(font.response?.status, 502);
  const chunk = await sw.request('/assets/index-AbCdEf12.js', { mode: 'no-cors' });
  assert.equal(chunk.response?.status, 502);
  assert.deepEqual(sw.writes.filter(w => w.status >= 500), [], 'no 5xx stored in any cache');
});

test('U2 a font or icon asked for mid-deploy is answered from the stored copy', async () => {
  const sw = worker(deploying(502));
  const cache = await sw.open('majal-__BUILD_ID__-runtime');
  await cache.put('/fonts/4255019c1c.woff2', new Response('font', { status: 200 }));
  const answer = await sw.request('/fonts/4255019c1c.woff2', { mode: 'no-cors' });
  assert.equal(answer.response?.status, 200);
  assert.equal(await answer.response!.text(), 'font');
});

test('U2 truly offline still opens the stored shell', async () => {
  const sw = worker(async pathname => {
    if (pathname === '/updating.html') return pageResponse();
    if (pathname === '/' || pathname === '/index.html') return html('<p>app shell</p>');
    throw new TypeError('offline');
  }, { online: false });
  await sw.lifecycle('install');
  const shell = await sw.request('/marketplace');
  assert.equal(await shell.response!.text(), '<p>app shell</p>');
});

test('U3 install stores the page in a fixed cache that activate keeps; a good navigation refills it', async () => {
  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  assert.ok(sw.store.get('majal-updating')?.has('/updating.html'));
  await (await sw.open('majal-oldbuild-shell')).put('/x', new Response('x'));
  await sw.lifecycle('activate');
  assert.ok(sw.store.has('majal-updating'));
  assert.ok(!sw.store.has('majal-oldbuild-shell'));

  const empty = worker(async pathname => (pathname === '/updating.html' ? pageResponse() : html(GOOGLE_502, 502)));
  assert.equal((await empty.request('/marketplace')).response?.status, 502, 'no stored page: the answer is returned as it came');
  const refill = worker(async pathname => (pathname === '/updating.html' ? pageResponse() : html('<p>ok</p>')));
  await refill.request('/marketplace');
  assert.ok(refill.store.get('majal-updating')?.has('/updating.html'));

  const source = read('public/sw.js');
  assert.ok(source.includes("const BUILD = '__BUILD_ID__';"), 'build stamp placeholder kept');
});

test('U4 the page is self-contained, RTL, light/dark and uses the required copy', () => {
  assert.ok(!/https?:\/\//i.test(PAGE) && !/\bsrc=/i.test(PAGE) && !/<link\b/i.test(PAGE) && !/@import/i.test(PAGE));
  assert.ok((PAGE.match(/url\("([^"]+)"\)/g) || []).every(u => /^url\("\/fonts\//.test(u)));
  for (const u of PAGE.match(/\/fonts\/[\w.]+\.woff2/g) || []) assert.ok(fs.existsSync(path.join('public', u)), u);
  assert.match(PAGE, /<html lang="ar" dir="rtl">/);
  assert.match(PAGE, /prefers-color-scheme:dark/);
  assert.match(PAGE, /prefers-reduced-motion/);
  assert.match(PAGE, /<title>نُحدّث البرنامج · مجال<\/title>/);
  for (const text of ['نُحدّث البرنامج الآن ✨', 'لحظاتٍ ونعود', 'أعد المحاولة الآن', 'لا اتصال بالإنترنت الآن']) assert.ok(PAGE.includes(text), text);
});

function runPage(options: { health: boolean[]; recent?: number[]; pathname?: string; online?: boolean }) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE)?.[1] || '';
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const asked: string[] = [];
  const nodes: Record<string, any> = {};
  const node = (id: string) => (nodes[id] ??= { textContent: '', addEventListener() {} });
  const store: Record<string, string> = options.recent ? { 'majal-updating-reloads': JSON.stringify(options.recent) } : {};
  const location = { pathname: options.pathname ?? '/marketplace', reloads: 0, replaced: '', reload() { this.reloads++; }, replace(url: string) { this.replaced = url; } };
  let call = 0;
  vm.runInNewContext(script, {
    document: { getElementById: node, addEventListener() {}, hidden: false },
    window: { addEventListener() {} }, navigator: { onLine: options.online ?? true }, location,
    sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    fetch: (url: string, init: any) => { asked.push(`${url}|${init?.cache}`); return Promise.resolve({ ok: options.health[Math.min(call++, options.health.length - 1)] }); },
    AbortController, JSON, Date, Math,
  });
  const step = async () => {
    const timer = timers.filter(t => t.ms !== 8000).shift()!;
    timers.splice(timers.indexOf(timer), 1);
    timer.fn(); await tick(); await tick();
    return timer.ms;
  };
  return { asked, location, nodes, step };
}

test('U4 asks /api/ready every 3 s and reopens the same URL when the server is back', async () => {
  const page = runPage({ health: [false, false, true] });
  const delays = [await page.step(), await page.step(), await page.step()];
  assert.deepEqual(delays, [3000, 3000, 3000]);
  assert.ok(page.asked.every(a => a === '/api/ready|no-store'), String(page.asked));
  assert.equal(page.location.reloads, 1);
});

test('U4 backs off to at most 15 s while the server stays down', async () => {
  const page = runPage({ health: [false] });
  const delays: number[] = [];
  for (let i = 0; i < 16; i++) delays.push(await page.step());
  assert.equal(delays[0], 3000);
  assert.ok(delays[delays.length - 1] > 3000 && delays.every(ms => ms <= 15000));
  assert.ok(delays.every((ms, i) => i === 0 || ms >= delays[i - 1]));
  assert.equal(page.location.reloads, 0);
});

test('U4 never loops: three reloads in two minutes slow it to every 30 s', async () => {
  const now = Date.now();
  const page = runPage({ health: [true], recent: [now - 5000, now - 4000, now - 3000] });
  assert.equal(await page.step(), 30000);
  assert.ok(page.nodes.lead.textContent.includes('وقتاً أطول'));
});

test('U4 opened by name it returns to the start; offline it says so and does not ask', async () => {
  const named = runPage({ health: [true], pathname: '/updating.html' });
  await named.step();
  assert.equal(named.location.replaced, '/');
  assert.equal(named.location.reloads, 0);
  const offline = runPage({ health: [true], online: false });
  await offline.step();
  assert.equal(offline.asked.length, 0);
  assert.ok(offline.nodes.title.textContent.includes('لا اتصال'));
});

test('U5 the CSP allows exactly the inline script hash and nothing external', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE)![1];
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  assert.ok(CSP.includes(`script-src 'sha256-${hash}'`));
  assert.ok(CSP.startsWith("default-src 'none'"));
  assert.ok(!/https?:|unsafe-eval|'self' 'unsafe-inline'/.test(CSP.split('; ').filter(d => d.startsWith('script-src')).join('')));
  assert.equal(updatingPageCsp('<p>no script</p>'), null);
  const server = read('server.ts');
  assert.match(server, /updatingPageCsp\(fs\.readFileSync\(updatingPath, 'utf8'\)\)/);
  assert.match(server, /filePath === updatingPath\) res\.setHeader\('Content-Security-Policy', updatingCsp\)/);
});
