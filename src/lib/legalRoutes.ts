export type LegalDocumentId = 'TERMS' | 'PRIVACY' | 'REFUND' | 'COMPLIANCE';

export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentId, string> = {
  TERMS: '/terms',
  PRIVACY: '/privacy',
  REFUND: '/refund',
  COMPLIANCE: '/compliance'
};

const PATH_DOCUMENTS = new Map(
  Object.entries(LEGAL_DOCUMENT_PATHS).map(([document, path]) => [path, document as LegalDocumentId])
);

export function legalDocumentFromPath(pathname: string): LegalDocumentId | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PATH_DOCUMENTS.get(normalized) ?? null;
}

export function legalPath(document: LegalDocumentId) {
  return LEGAL_DOCUMENT_PATHS[document];
}
