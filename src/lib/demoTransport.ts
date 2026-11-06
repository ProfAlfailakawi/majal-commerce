/*
 * نقل معرّف الصندوق التجريبي من المتصفح إلى الخادم — في ترويسة لا في كوكي.
 *
 * Firebase Hosting يحذف كل الكوكيز من الطلبات المارّة إلى Cloud Run إلا `__session`، فالكوكي لا تصل.
 * لذا يُحمل المعرّف في `x-majal-demo`، وبترقيع `fetch` مرة واحدة بدل الاعتماد على كل موضع نداء:
 * نداء يفوته الترويسة معناه طلب يخرج من الصندوق إلى القاعدة الحقيقية، وهذا لا يجوز أن يتوقف على انتباه
 * من يضيف نداءً غدًا. (الخادم يردّ ما لا تسمح به قائمة السماح في `server/demo-sandbox.ts` أيضًا.)
 *
 * المعرّف في `sessionStorage` (لكل لسان صندوقه) بصيغة `demo_` + 64 ست عشري، وهي صيغة يتحقق منها الخادم.
 * الترويسة لا تُرسل إلا إلى مسارات `/api/` في أصل هذا الموقع.
 */

export const DEMO_HEADER = 'x-majal-demo';
const DEMO_ID_KEY = 'majal_demo_sandbox_id_v1';
const DEMO_ID_PATTERN = /^demo_[0-9a-f]{64}$/;

export function readDemoSandboxId(): string {
  try {
    const value = String(window.sessionStorage.getItem(DEMO_ID_KEY) ?? '').trim();
    return DEMO_ID_PATTERN.test(value) ? value : '';
  } catch {
    return '';
  }
}

export function rememberDemoSandboxId(id: unknown): boolean {
  const value = String(id ?? '').trim();
  if (!DEMO_ID_PATTERN.test(value)) return false;
  try { window.sessionStorage.setItem(DEMO_ID_KEY, value); return true; } catch { return false; }
}

export function forgetDemoSandboxId(): void {
  try { window.sessionStorage.removeItem(DEMO_ID_KEY); } catch { /* لا يمنع الخروج */ }
}

function isOwnApiRequest(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

let installed = false;

export function installDemoTransport(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = function majalDemoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const id = readDemoSandboxId();
      if (!id || !isOwnApiRequest(input)) return original(input, init);
      if (typeof Request !== 'undefined' && input instanceof Request && !init) {
        const headers = new Headers(input.headers);
        headers.set(DEMO_HEADER, id);
        return original(new Request(input, { headers }));
      }
      const headers = new Headers(init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
      headers.set(DEMO_HEADER, id);
      return original(input, { ...init, headers });
    } catch {
      return original(input, init);
    }
  } as typeof window.fetch;
}

// يُركَّب عند تقييم الوحدة، قبل أي مستورد يلتقط `fetch` في ثابت.
installDemoTransport();
