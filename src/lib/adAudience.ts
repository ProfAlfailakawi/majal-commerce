import type { User } from '../types/majal';

/**
 * The only thing ad targeting ever knows about a viewer: which kind of participant they are.
 * No profile, history or identifier is sent — just one of these five words.
 */
export type AdAudience = 'VISITOR' | 'CONSUMER' | 'CREATOR' | 'HOST' | 'SUPPLIER';

export const AD_AUDIENCE_LABEL: Record<AdAudience, string> = {
  VISITOR: 'زوّار', CONSUMER: 'متسوّقون', CREATOR: 'مبدعون', HOST: 'منشآت', SUPPLIER: 'موردون',
};
export const AD_AUDIENCES: readonly AdAudience[] = ['VISITOR', 'CONSUMER', 'CREATOR', 'HOST', 'SUPPLIER'];
/** Product categories a campaign can follow; they are the marketplace's own categories. */
export const AD_TOPICS = ['حلويات', 'مخبوزات', 'مشروبات', 'وجبات', 'صلصات', 'مقبلات'] as const;

export function audienceOf(user: Pick<User, 'id' | 'role' | 'accountType'> | null | undefined): AdAudience {
  if (!user || user.id === 'anonymous') return 'VISITOR';
  if (user.accountType === 'SUPPLIER') return 'SUPPLIER';
  if (user.role === 'CREATOR') return 'CREATOR';
  if (user.role.startsWith('HOST_')) return 'HOST';
  if (user.role === 'CONSUMER') return 'CONSUMER';
  // Administrators browse as visitors so their previews never skew a company's numbers.
  return 'VISITOR';
}
