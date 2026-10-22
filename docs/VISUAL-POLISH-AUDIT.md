# Visual polish audit

Scope: visual layer only. The site already follows `DESIGN_SYSTEM.md` closely (stat tiles, journey stepper,
rings and arcs, one gold accent), so changes are deliberately small: shorter microcopy and two structural
infographic touches built from existing props. No logic, handlers, routes, ids or aria hooks were touched.

## Method and honest coverage
- Inventory: 100 UI files (`git ls-files` for tsx/css/html): 86 components, `App`, `main`, `index.css`, `index.html`,
  `public/presentation/majal-deck.html`, `public/fonts/fonts.css`, plus `dna/` CSS.
- Rendered in demo mode (vite dev, Chromium, 390px and 1280px): landing, market (consumer), creator, host, supplier,
  admin, super admin, showcase, supplier directory. Every one was checked for horizontal overflow (none) and
  page height. Landing, creator, host and super admin were additionally read visually. The other screens were
  not read in detail, and their components were inventoried, not line-audited.
- Not rendered here: auth modal, contract/deal/recipe-vault modals, checkout and payment return, invite page,
  ad/partner report pages, legal center, onboarding, deck. Those need a backend or specific state, and were left alone.
- Presentation-only guards: no `guard-*` scripts exist; `scripts/verify-pwa.mjs` runs in `npm run build`.

## Findings and actions
| Screen / component | Finding | Action |
|---|---|---|
| `public/PublicLanding.tsx` hero paragraph | 2 to 3 lines restating the journey and the jobs gate | shortened to one sentence |
| `PublicLanding` showcase strip | sentence with three clauses | shortened |
| `PublicLanding` bento cards | role card listed four roles inside a sentence; other bodies long | role card now shows a chip row (owner, chef, finance, marketing; same four roles as before); bodies shortened |
| `public/JourneyInfographic.tsx` intro | explanatory sentence under heading | shortened (the step lock rule is still stated) |
| `creator/CreatorPortal.tsx` hero | long list sentence | shortened |
| `creator/RecipeAccessRequests.tsx` | "level requested/granted: N (max 3)" prose | 3-segment level meter plus `N/3`, with an accessible `role=img` label; purpose line unchanged |
| `admin/AdminDashboard.tsx` hero | sentence listing six duties | shortened |
| `admin/SuperAdminDashboard.tsx` hero | long sentence | shortened |
| `admin/MajalPulse.tsx` subtitle | long sentence | shortened |

## Deliberately left alone
- `host/ProductDiscovery.tsx`: two stacked request buttons per card are two different access levels (Recipe Vault flow). Merging would change behavior.
- Anything touching payments, contracts, settlement, auth, vault access: not opened for edit.
- Tab bars, hero stat tiles, ledgers, rings: already infographic; adding more would add noise.
- Large hero glow circles: documented in `DESIGN_SYSTEM.md` as intentionally kept.

## Round 2 - motion layer and wider rendering

Scope: presentation only. Existing identity layers (`index.css` gate motif, DNA kit, `useDrawIn` rings) already
carry most of the visual hierarchy and already own ring/bar draw-in, stat-tile rise and the splash/onboarding
choreography, so this round builds on them instead of redrawing screens. New files: `src/motion.css` (loaded last
from `main.tsx`), `src/lib/motionReveal.ts`. Only other edits: a `data-surface` attribute on `<main>` in `App.tsx`
and two lines in `main.tsx`. No server, logic, copy, ids or aria changed.

### Rendered this round (demo mode, Chromium, 390 and 1280)
Landing, market, creator, host, supplier, admin, super admin, showcase, directory, onboarding, payment-return
(error state), invite (invalid-token state), legal center, ad report / gate report / partner kit routes (token
routes). Viewed by eye: landing (light 1280, dark 390), creator (light 1280, contrast 390), host (dark 1280),
onboarding step 1, payment-return, invite. Horizontal overflow checked on all (none); page heights unchanged
by the CSS (no layout shift). Dark and high-contrast themes rendered for landing, market, creator, admin, host.

### Motion inventory (all under `prefers-reduced-motion: no-preference`; tokens `--m-ease`, `--m-d1/2/3` = 120/180/260ms)
| What | Trigger | Duration | Notes |
|---|---|---|---|
| Surface content fade + 8px rise | surface/route mount | 260ms | `backwards` fill, so no transform remains; off on payment return |
| Button press `scale(.98)` | `:active` | 120ms | off inside contract, checkout, recipe-vault and unit-economics dialogs |
| Clickable `glass-card` lift 1px | hover (hover devices) | 180ms | |
| Chevron nudge 2px | hover | 180ms | |
| Disclosure content rise | `<details>` open | 180ms | |
| Dialog panel rise | mount | 260ms | only panels without their own entrance; excluded: contract, checkout, vault, unit economics |
| Staggered first appearance (max 8, 40ms step) | card first scrolls into view | 260ms | public landing, market, showcase, directory only; once per element; attribute removed afterwards; 8s safety net shows any still-waiting card at rest |
Not touched: rings/bars (already `useDrawIn`), stat tiles (already `.majal-stat`), role portals, contract, settlement,
payment, vault, forms, tables, reading text.

### Left alone and why
Hero glow circles (documented in DESIGN_SYSTEM.md), all server and vault/contract/settlement/payment code, the
round-1 disclosure meter (no motion added on vault surfaces), copy and markup of tested elements.

### Could not verify
- Contract, deal-room, recipe-vault and checkout dialogs, auth modal: not opened (need seeded flows or a backend); only their exclusion selectors were written from source.
- Payment return and invite were seen only in their error/invalid states.
- Below-the-fold cards are hidden until scrolled (or 8s); a full-page capture taken at once after load can show them
  as empty for up to 8s.
- No automated visual tests exist in the repo; animation end states were checked by counting `data-reveal` attributes (all cleared after scrolling), reduced motion by emulation (none set).
