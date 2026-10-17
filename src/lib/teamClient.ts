import { authCsrfToken } from './authClient';
import { IS_DEMO_MODE } from './runtime';
import type { UserRole } from '../types/majal';

export const TEAM_ROLES = ['HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT'] as const satisfies readonly UserRole[];
export type TeamRole = (typeof TEAM_ROLES)[number];
export interface TeamMember { userId: string; name: string; email: string; role: string; status: string; self: boolean }
export interface TeamInvite { id: string; email: string; role: string; expiresAt: string }
export interface TeamOverview { members: TeamMember[]; invites: TeamInvite[] }

export class TeamApiError extends Error { constructor(message: string, public readonly code?: string) { super(message); } }

async function request<T>(path: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const response = await fetch(`/api/v1/team${path}`, {
    ...init, credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': authCsrfToken() } : {}), ...init.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new TeamApiError(payload.error || 'تعذّر إكمال الطلب.', payload.code);
  return payload as T;
}

/* Demo: a tab-local roster so the owner can try the whole flow without a server. */
const DEMO_KEY = 'majal_demo_team_v1';
type DemoTeam = { members: TeamMember[]; invites: TeamInvite[] };
const demoLoad = (): DemoTeam => {
  try { const raw = window.sessionStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch { /* fresh */ }
  return { members: [], invites: [] };
};
const demoSave = (s: DemoTeam) => { try { window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* demo only */ } };

/* First look at the demo roster seeds it from the people the demo already has in this facility. */
async function demoRoster(): Promise<DemoTeam> {
  const existing = (() => { try { return window.sessionStorage.getItem(DEMO_KEY); } catch { return null; } })();
  if (existing) return demoLoad();
  const { store } = await import('./store');
  const hostId = store.activeUser.hostBusinessId;
  const members: TeamMember[] = hostId
    ? store.users.filter(u => u.hostBusinessId === hostId).map(u => ({ userId: u.id, name: u.name, email: u.email, role: u.role, status: u.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE', self: u.id === store.activeUser.id }))
    : [];
  const seeded = { members, invites: [] };
  demoSave(seeded);
  return seeded;
}

export const fetchTeam = (): Promise<TeamOverview> => IS_DEMO_MODE ? demoRoster() : request('');
export const inviteTeamMember = async (email: string, role: TeamRole): Promise<{ invite: TeamInvite; link: string }> => {
  if (!IS_DEMO_MODE) return request('/invites', { method: 'POST', body: JSON.stringify({ email, role }) });
  const s = await demoRoster();
  const invite = { id: `inv_demo_${Date.now()}`, email, role, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
  s.invites.unshift(invite); demoSave(s);
  return { invite, link: `/?invite=demo-${invite.id}` };
};
export const revokeTeamInvite = async (id: string) => {
  if (!IS_DEMO_MODE) return request(`/invites/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
  const s = demoLoad(); s.invites = s.invites.filter(i => i.id !== id); demoSave(s); return { ok: true };
};
export const changeTeamMember = async (userId: string, change: { role?: TeamRole; status?: 'ACTIVE' | 'SUSPENDED' }) => {
  if (!IS_DEMO_MODE) return request(`/members/${encodeURIComponent(userId)}`, { method: 'POST', body: JSON.stringify(change) });
  const s = demoLoad(); const m = s.members.find(x => x.userId === userId); if (m) Object.assign(m, change); demoSave(s); return { ok: true };
};
export const removeTeamMember = async (userId: string) => {
  if (!IS_DEMO_MODE) return request(`/members/${encodeURIComponent(userId)}/remove`, { method: 'POST' });
  const s = demoLoad(); s.members = s.members.filter(x => x.userId !== userId); demoSave(s); return { ok: true };
};
/* Demo invite links look like `demo-<inviteId>`; they only resolve in the tab that created them. */
const demoInviteOf = (token: string) => demoLoad().invites.find(i => `demo-${i.id}` === token);
export const previewInvite = async (token: string): Promise<{ organizationName: string; role: string; email: string }> => {
  if (IS_DEMO_MODE) {
    const invite = demoInviteOf(token);
    if (!invite) throw new TeamApiError('الدعوة غير صالحة أو انتهت.', 'INVITE_INVALID');
    const { store } = await import('./store');
    return { organizationName: store.hosts.find(h => h.id === store.activeUser.hostBusinessId)?.commercialName || 'منشأة تجريبية', role: invite.role, email: invite.email };
  }
  return request(`/invites/${encodeURIComponent(token)}`);
};
export const acceptInvite = async (input: { token: string; name: string; password: string; phone?: string }): Promise<{ message: string }> => {
  if (IS_DEMO_MODE) {
    const s = demoLoad(); const invite = demoInviteOf(input.token);
    if (!invite) throw new TeamApiError('الدعوة غير صالحة أو انتهت.', 'INVITE_INVALID');
    s.invites = s.invites.filter(i => i.id !== invite.id);
    s.members.push({ userId: `usr_demo_${Date.now()}`, name: input.name, email: invite.email, role: invite.role, status: 'ACTIVE', self: false });
    demoSave(s);
    return { message: 'تم تفعيل الحساب (بيئة العرض).' };
  }
  return request('/invites/accept', { method: 'POST', body: JSON.stringify(input) });
};
