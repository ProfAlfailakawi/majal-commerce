import { request } from './domainClient';

/** App Store 1.2: التواصل مع الإشراف بشأن المحتوى المخالف. */
export const MODERATION_EMAIL = 'info@skygateeducation.com';

export const DELETION_NOTICE = 'سنحذف حسابك خلال 30 يومًا؛ السجلات التي يُلزمنا القانون بالاحتفاظ بها تبقى بصيغة مجهّلة.';
export const DELETION_NOTICE_EN = 'We will delete your account within 30 days; records we are legally required to keep are retained in de-identified form.';

export type ReportReason = 'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'OTHER';

export type SafetyQueues = {
  reviewReports: Array<{ id: string; reviewId: string; reason: ReportReason; note: string; createdAt: string; reviewComment: string; reviewStatus: string; tasteRating: number }>;
  deletionRequests: Array<{ id: string; userId: string; requestedAt: string; name: string; email: string; role: string }>;
};

export const safetyClient = {
  reportReview: (reviewId: string, reason: ReportReason, note = '') =>
    request<{ reported: boolean }>(`/api/v1/safety/reviews/${encodeURIComponent(reviewId)}/report`, { method: 'POST', body: JSON.stringify({ reason, note }) }),
  requestAccountDeletion: (password: string) =>
    request<{ request: { id: string; status: string }; message: string; messageEn: string }>('/api/v1/safety/account/deletion-request', { method: 'POST', body: JSON.stringify({ password }) }),
  queues: () => request<SafetyQueues>('/api/v1/safety/admin/queues'),
  resolveReviewReport: (reportId: string, decision: 'HIDE' | 'DISMISS') =>
    request<{ resolved: boolean }>(`/api/v1/safety/admin/review-reports/${encodeURIComponent(reportId)}/resolve`, { method: 'POST', body: JSON.stringify({ decision }) }),
};
