/*
 * تنبيهات النظام (APNs) داخل تطبيق iOS الرسمي.
 * الصفحة تُحمَّل من الموقع داخل WKWebView، فنكلّم إضافة @capacitor/push-notifications
 * المثبّتة في القشرة عبر window.Capacitor. في المتصفح العادي تعيد الدوال "unsupported" ولا تفعل شيئًا.
 */
import { authCsrfToken } from './authClient';
import { apiFetch } from './apiFetch';

export type NativePushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

type Handle = { remove: () => Promise<void> };
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (payload: any) => void) => Promise<Handle>;
};

const getPlugin = (): PushPlugin | null => {
  try {
    const cap = (window as unknown as { Capacitor?: any }).Capacitor;
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'ios') return null;
    return (cap.Plugins?.PushNotifications as PushPlugin) || null;
  } catch {
    return null;
  }
};

export const isNativePushAvailable = () => typeof window !== 'undefined' && !!getPlugin();

const mapPermission = (value?: string): NativePushPermission => value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'default';

export async function readNativePushPermission(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return 'unsupported';
  try { return mapPermission((await plugin.checkPermissions()).receive); } catch { return 'unsupported'; }
}

/** يسجّل الجهاز لدى APNs ويعيد توكنه (hex)، أو "" عند الفشل أو انتهاء المهلة. */
async function registerToken(plugin: PushPlugin, timeoutMs = 15_000): Promise<string> {
  const handles: Handle[] = [];
  try {
    return await new Promise<string>(resolve => {
      const timer = setTimeout(() => resolve(''), timeoutMs);
      const done = (value: string) => { clearTimeout(timer); resolve(value); };
      (async () => {
        handles.push(await plugin.addListener('registration', (t: { value?: string }) => done(String(t?.value || ''))));
        handles.push(await plugin.addListener('registrationError', () => done('')));
        await plugin.register();
      })().catch(() => done(''));
    });
  } finally {
    await Promise.all(handles.map(h => h.remove().catch(() => undefined)));
  }
}

async function sendToken(path: string, token: string) {
  const response = await apiFetch(`/api/v1/notifications/push/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': authCsrfToken() },
    body: JSON.stringify({ token })
  });
  return response.ok;
}

const TOKEN_KEY = 'majal.apnsToken';

/** نقرة واحدة: نافذة إذن iOS، ثم تسجيل الجهاز وإرسال توكنه إلى الخادم. */
export async function enableNativePush(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return 'unsupported';
  let permission = await readNativePushPermission();
  if (permission === 'default') {
    try { permission = mapPermission((await plugin.requestPermissions()).receive); } catch { return 'unsupported'; }
  }
  if (permission !== 'granted') return permission;
  const token = await registerToken(plugin);
  if (!token || !(await sendToken('subscribe-native', token).catch(() => false))) throw new Error('تعذّر تسجيل الجهاز للتنبيهات. حاول مرة أخرى.');
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* optional */ }
  return 'granted';
}

export async function disableNativePush() {
  let token = '';
  try { token = localStorage.getItem(TOKEN_KEY) || ''; localStorage.removeItem(TOKEN_KEY); } catch { /* optional */ }
  if (token) await sendToken('unsubscribe-native', token).catch(() => false);
}

export function nativePushEnabledLocally() {
  try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; }
}

/** إذا كان الإذن ممنوحًا: جدّد التوكن عند كل تشغيل (قد يتغيّر)، واستمع للمس التنبيه لفتح رابطه. */
let wired = false;
export async function initNativePush(navigate: (url: string) => void = url => window.location.assign(url)) {
  const plugin = getPlugin();
  if (!plugin || wired) return;
  wired = true;
  await plugin.addListener('pushNotificationActionPerformed', (action: { notification?: { data?: { url?: unknown } } }) => {
    const url = action?.notification?.data?.url;
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) navigate(url);
  }).catch(() => undefined);
  if (nativePushEnabledLocally() && (await readNativePushPermission()) === 'granted') {
    const token = await registerToken(plugin);
    if (token) {
      await sendToken('subscribe-native', token).catch(() => false);
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* optional */ }
    }
  }
}
