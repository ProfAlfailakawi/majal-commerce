import { authCsrfToken } from './authClient';
import { KuwaitiJobApplication, KuwaitiJobPost, SupplierOffering, SupplierProfile } from '../types/majal';
import { IS_DEMO_MODE } from './runtime';
import { demoEcosystem, type DemoIdentity } from '../data/demoEcosystem';

/* Demo tabs have no session cookie, so every call below would 401. Inside an
 * explicitly-entered demo the same functions answer from the local demo
 * ecosystem instead; outside it this branch is never taken. */
async function demoIdentity(): Promise<DemoIdentity & { employerName: string }> {
  const { store } = await import('./store');
  const user = store.activeUser;
  const host = user.hostBusinessId ? store.hosts.find(h => h.id === user.hostBusinessId) : undefined;
  return { ...user, employerName: host?.commercialName || user.name };
}

export class EcosystemApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); }
}

type PublicEcosystem = { suppliers: SupplierProfile[]; offerings: SupplierOffering[]; jobs: KuwaitiJobPost[] };
type MyEcosystem = { supplier: SupplierProfile | null; offerings: SupplierOffering[]; jobs: KuwaitiJobPost[] };
type ReviewQueue = { suppliers: SupplierProfile[]; jobs: KuwaitiJobPost[] };

async function request<T>(path: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const response = await fetch(`/api/v1/ecosystem${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': authCsrfToken() } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EcosystemApiError(payload.error || 'تعذّر إكمال الطلب.', payload.code, response.status);
  return payload as T;
}

export const fetchPublicEcosystem = (): Promise<PublicEcosystem> => IS_DEMO_MODE ? demoEcosystem.publicView() : request<PublicEcosystem>('/public');
export const fetchMyEcosystem = async (): Promise<MyEcosystem> => IS_DEMO_MODE ? demoEcosystem.myView(await demoIdentity()) : request<MyEcosystem>('/me');
export const submitSupplierVerification = async (commercialRegistrationNo: string): Promise<{ supplier: SupplierProfile }> => IS_DEMO_MODE ? demoEcosystem.submitVerification(await demoIdentity(), commercialRegistrationNo) : request<{ supplier: SupplierProfile }>('/supplier/submit-verification', {
  method: 'POST', body: JSON.stringify({ commercialRegistrationNo })
});
export const createSupplierOffering = (input: { name:string; category:string; description?:string; unit?:string; minOrderQty?:number; leadTimeDays?:number; priceFromFils?:number|null }) =>
  IS_DEMO_MODE ? demoIdentity().then(who => demoEcosystem.createOffering(who, input)) : request<{ offering: SupplierOffering }>('/offerings', { method: 'POST', body: JSON.stringify(input) });
export const createKuwaitiJob = (input: {
  title:string; department?:string; employmentType:string; location:string; description:string; requirements?:string[]; salaryMinFils?:number|null; salaryMaxFils?:number|null;
}): Promise<{ job: KuwaitiJobPost; message: string }> => IS_DEMO_MODE ? demoIdentity().then(who => demoEcosystem.createJob(who, who.employerName, input)) : request<{ job: KuwaitiJobPost; message: string }>('/jobs', { method: 'POST', body: JSON.stringify(input) });
export const closeKuwaitiJob = (id: string): Promise<{ id:string; status:'CLOSED' }> => IS_DEMO_MODE ? demoEcosystem.closeJob(id) : request<{ id:string; status:'CLOSED' }>(`/jobs/${encodeURIComponent(id)}/close`, { method: 'POST' });
export const fetchKuwaitiJobApplications = (id: string): Promise<{ job: KuwaitiJobPost; applications: KuwaitiJobApplication[] }> => IS_DEMO_MODE ? demoEcosystem.applications(id) : request<{ job: KuwaitiJobPost; applications: KuwaitiJobApplication[] }>(`/jobs/${encodeURIComponent(id)}/applications`);
export const applyToKuwaitiJob = (id: string, input: { fullName?:string; email?:string; phone?:string; summary?:string; yearsExperience?:number; kuwaitiDeclaration:true }) =>
  IS_DEMO_MODE ? demoIdentity().then(who => demoEcosystem.apply(who, id, input)) : request<{ id:string; status:string; note:string }>(`/jobs/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify(input) });
export const fetchEcosystemReviewQueue = (): Promise<ReviewQueue> => IS_DEMO_MODE ? demoEcosystem.reviewQueue() : request<ReviewQueue>('/admin/review-queue');
export const reviewSupplier = (id: string, decision: 'VERIFIED'|'NEEDS_ACTION'|'SUSPENDED', adminNote = ''): Promise<{ supplier: SupplierProfile }> =>
  IS_DEMO_MODE ? demoEcosystem.reviewSupplier(id, decision, adminNote) : request<{ supplier: SupplierProfile }>(`/admin/suppliers/${encodeURIComponent(id)}/review`, { method:'POST', body: JSON.stringify({ decision, adminNote }) });
export const reviewKuwaitiJob = (id: string, decision: 'APPROVED'|'REJECTED', adminNote = ''): Promise<{ job: KuwaitiJobPost }> =>
  IS_DEMO_MODE ? demoEcosystem.reviewJob(id, decision, adminNote) : request<{ job: KuwaitiJobPost }>(`/admin/jobs/${encodeURIComponent(id)}/review`, { method:'POST', body: JSON.stringify({ decision, adminNote }) });
