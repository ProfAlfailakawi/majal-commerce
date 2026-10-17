import { useEffect } from 'react';

/**
 * Pages reached through a private link (partner kit, campaign report, team invitation) must never
 * be indexed or kept in a search engine's cache: adds `noindex` while mounted and removes it after.
 */
export function usePrivatePage() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}
