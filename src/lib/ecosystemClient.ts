import { authCsrfToken } from './authClient';
import { KuwaitiJobApplication, KuwaitiJobPost, SupplierOffering, SupplierProfile } from '../types/majal';

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

export const fetchPublicEcosystem = () => request<PublicEcosystem>('/public');
export const fetchMyEcosystem = () => request<MyEcosystem>('/me');
export const submitSupplierVerification = (commercialRegistrationNo: string) => request<{ supplier: SupplierProfile }>('/supplier/submit-verification', {
  method: 'POST', body: JSON.stringify({ commercialRegistrationNo })
});
export const createSupplierOffering = (input: { name:string; category:string; description?:string; unit?:string; minOrderQty?:number; leadTimeDays?:number; priceFromFils?:number|null }) =>
  request<{ offering: SupplierOffering }>('/offerings', { method: 'POST', body: JSON.stringify(input) });
export const createKuwaitiJob = (input: {
  title:string; department?:string; employmentType:string; location:string; description:string; requirements?:string[]; salaryMinFils?:number|null; salaryMaxFils?:number|null;
}) => request<{ job: KuwaitiJobPost; message: string }>('/jobs', { method: 'POST', body: JSON.stringify(input) });
export const closeKuwaitiJob = (id: string) => request<{ id:string; status:'CLOSED' }>(`/jobs/${encodeURIComponent(id)}/close`, { method: 'POST' });
export const fetchKuwaitiJobApplications = (id: string) => request<{ job: KuwaitiJobPost; applications: KuwaitiJobApplication[] }>(`/jobs/${encodeURIComponent(id)}/applications`);
export const applyToKuwaitiJob = (id: string, input: { fullName?:string; email?:string; phone?:string; summary?:string; yearsExperience?:number; kuwaitiDeclaration:true }) =>
  request<{ id:string; status:string; note:string }>(`/jobs/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify(input) });
export const fetchEcosystemReviewQueue = () => request<ReviewQueue>('/admin/review-queue');
export const reviewSupplier = (id: string, decision: 'VERIFIED'|'NEEDS_ACTION'|'SUSPENDED', adminNote = '') =>
  request<{ supplier: SupplierProfile }>(`/admin/suppliers/${encodeURIComponent(id)}/review`, { method:'POST', body: JSON.stringify({ decision, adminNote }) });
export const reviewKuwaitiJob = (id: string, decision: 'APPROVED'|'REJECTED', adminNote = '') =>
  request<{ job: KuwaitiJobPost }>(`/admin/jobs/${encodeURIComponent(id)}/review`, { method:'POST', body: JSON.stringify({ decision, adminNote }) });
