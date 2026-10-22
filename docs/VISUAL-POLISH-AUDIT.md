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
