# Quality scorecard (round 3)

Presentation only. Harness: Playwright + axe-core (wcag2a/aa/21/22aa + best-practice) plus DOM checks, per screen
state. Hard criteria: H1 axe clean, H2 no horizontal overflow, H3 no clipped text, H4 no console/page errors,
H5 CLS < 0.1, H6 visible focus on first 30 focusables, H7 nothing stuck invisible, H8 no running animations under
reduced motion, H9 text contrast. A state is "perfect" only if every hard criterion passes.

## Coverage
Demo mode (vite dev, no API server), Chromium, Arabic RTL. 23 states x 4 viewports (320/390/768/1280) x light/dark
x normal/reduced motion = 368 measurements per run. States: identity menu, six demo accounts (super admin,
consumer, admin, creator, host, supplier), public landing, showcase, directory, consumer market, notifications
drawer, AI drawer, payment-return, invite, partner kit, my-report, ad-report, terms, privacy, refund, compliance,
first-run onboarding.

## Before / after
| | Perfect states | Total |
|---|---|---|
| Before (origin/main 7ddeb49) | 17 (4.6%) | 368 |
| After, run 1 (dark/normal incomplete, re-run separately) | 158 (42.9%) | 368 |

Hard failures before -> after (the after column is the last full run; two later fixes are noted below):
| Criterion | Before | After |
|---|---|---|
| H1 axe | 276 | 40 (24 of them target-size on two demo-only icon buttons, fixed afterwards, see below) |
| H6 focus | 194 | 194 (harness artifact, see below) |
| H7 stuck invisible | 36 | 1 |
| H9 contrast | 17 | 0 in this run |
| H4 errors | 15 | 5 (ad-report with no API) |
| H5 CLS | 5 | 0 |
| H8 reduced motion | 2 | 0 |
After the run, the two demo-chrome icon buttons were enlarged to 24px and re-measured at 1280 light (the target-size
rule no longer fires there). A full 368 re-run was not repeated after that last edit.

## What changed
- Heading order: footer and passport/directory headings now step down correctly (h2), removing about 140 axe hits.
- Landmarks: onboarding no longer nests a second banner/main/contentinfo; the sponsor strip is an `aside` named
  "رعاة مجال" (distinct from the other ad aside); creator and host error/empty states carry the page `h1`.
- Identity switcher menu: its items now have `role="menuitem"` (the menu role required it).
- Motion: below-the-fold cards no longer start at opacity 0. They wait 8px low and rise once (transform only,
  260ms, same easing), so content cannot be hidden or dimmed while waiting. A first attempt used opacity 0.6 and
  was reverted because dimmed cards failed contrast.
- Contrast: AI drawer disabled button text, DNA overline colour (mixed toward ink).
- Demo-only toolbar icon buttons raised from 20px to 24px.

## Judged by eye (390 and 1280, light)
Public landing, consumer market, host portal: hierarchy, spacing, Arabic type, icons over text already good; left alone.

## Left alone, and why
- H6 (194): the harness calls `element.focus()` programmatically, which Chrome does not always treat as keyboard
  focus. Real Tab traversal of the consumer screen showed a visible gold ring on every stop (global
  `:focus-visible` rule). Only that one screen was verified this way; the rest is inferred from the shared rule.
- ad-report: the page throws on the dev server's non-JSON reply (`report.days` undefined) when no API exists. That is
  logic, outside this pass, and it is the only remaining H1/H4 source.
- Soft metrics (text-wall paragraphs, sub-44px targets, informational): barely moved (1134 -> about 1150, 5505 -> about
  5450); not addressed broadly, because most are dense admin tables and chips.
- Reduced-motion transitions are 0.01ms by the existing global rule; the harness can still catch one mid-flight.

## Not viewed
Contract, deal-room, vault, checkout and auth dialogs (need seeded flows), real payment/invite states, all
screens against a real backend, high-contrast theme this round, dark theme screenshots (measured, not viewed),
and the after screenshots beyond spot checks.

## Commands
`npm run lint`, `npm test`, `npm run build` (results in the final report).
