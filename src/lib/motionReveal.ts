/**
 * Presentation-only: cards that start below the fold on calm public surfaces fade up once
 * when they first scroll into view. Nothing is hidden unless JS runs, IntersectionObserver
 * exists and the visitor allows motion; the attribute is removed when the animation ends, so
 * the resting element is untouched. Never runs on role, payment, contract or admin surfaces.
 */
const SURFACES = new Set(['PUBLIC', 'CONSUMER', 'SHOWCASE', 'DIRECTORY']);
const CANDIDATE = '.glass-card, .glass-panel, .majal-bento-card, .majal-ledger-cell';
const SKIP = '[role="dialog"], form, table, [data-no-motion]';

export function installMotionReveal(): void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      io.unobserve(el);
      el.setAttribute('data-reveal', 'in');
      const done = () => el.removeAttribute('data-reveal');
      el.addEventListener('animationend', done, { once: true });
      window.setTimeout(done, 700);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  let queued = false;
  const scan = () => {
    queued = false;
    if (reduce.matches) return;
    const main = document.getElementById('main-content');
    if (!main || !SURFACES.has(main.getAttribute('data-surface') || '')) return;
    const fresh = Array.from(main.querySelectorAll<HTMLElement>(CANDIDATE)).filter(el => !seen.has(el) && !el.closest(SKIP));
    const counts = new Map<Element, number>();
    for (const el of fresh) {
      seen.add(el);
      if (el.getBoundingClientRect().top < window.innerHeight) continue; // already on screen: leave alone
      const parent = el.parentElement as Element;
      const n = counts.get(parent) ?? 0;
      counts.set(parent, n + 1);
      el.style.setProperty('--reveal-delay', `${Math.min(n, 7) * 40}ms`);
      el.setAttribute('data-reveal', 'wait');
      io.observe(el);
      // Safety net: anything still waiting after 8s is shown at rest, so captures and slow readers never see holes.
      window.setTimeout(() => { if (el.getAttribute('data-reveal') === 'wait') { io.unobserve(el); el.removeAttribute('data-reveal'); } }, 8000);
    }
  };
  const queue = () => { if (!queued) { queued = true; window.requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
}
