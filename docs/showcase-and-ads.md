# Showcase gate, sponsor ads and facility team

Three related surfaces. All three keep the rule used by the jobs board: **nothing a visitor submits is public until an administrator approves it.**

> **What is free and what is paid.** The business-for-sale gate, the supplier directory and team invitations are **free** (no fees, no commission); the pages say so and why: they introduce people to the platform. **Sponsorship (ads) is a paid service.** The public pages promise no price: the company asks for a slot, we contact it, agree slot, duration and price, and only then approve. The app records the agreed price and payment status per campaign, but takes no online payment (settlement is by invoice or transfer, outside the app).

## 1. Businesses for sale (`SHOWCASE` surface)
- Free, no account. `POST /api/v1/showcase/businesses` (5 per hour per client, honeypot field `website`, explicit terms checkbox).
- Seller name and phone are stored; the public API never returns the name, and returns the phone only when the seller ticked *contactPublic*.
- Statuses: `PENDING_REVIEW → APPROVED | REJECTED`, and `APPROVED → SOLD` (hides it). Review is formal only; the page says so and says the service is free because it introduces the platform.
- Cards are drawn by the platform from the sector (`src/components/showcase/SectorArt.tsx`); sellers cannot upload pictures, so nobody can pass a misleading photograph.
- Admin: *Approvals* tab → «المشاريع المعروضة والإعلانات».

## 2. Sponsor campaigns
- Public endpoints live under `/api/v1/showcase/promo/*` (not `/ads/*`) because common content blockers filter that path segment and would silently drop sponsors and their counters.
- Slots: `SPONSOR` (strip under the navbar, exclusive), `MARKET` (3), `PORTAL` (3, compact cards in creator/host/supplier portals). Capacity is enforced **per overlapping date range** when a campaign is approved (`SLOT_FULL`). An open-ended campaign overlaps everything.
- A company asks for a slot (`POST /promo/requests`, 5/hour) — it chooses the preferred slot, roles, categories, colour and icon and sees a live preview — or an admin creates the campaign. Both start `PENDING_REVIEW` with billing `UNSET`; admins are notified.
- **Billing** (`POST /admin/campaigns/:id/billing`): `PAID` (whole-KWD amount, payment date kept on re-save), `COMPLIMENTARY` (explicit, audited free hosting) or `UNSET`. **A campaign cannot be approved while billing is `UNSET`** (`PAYMENT_REQUIRED`), and un-setting billing on an approved campaign pauses it. Prices and billing are never exposed publicly or in the company report. The owner dashboard shows paid last 30 days, paid total, requests awaiting a price and complimentary campaigns.
- The admin sets the dates and approves. Dates are Kuwait calendar days, end inclusive.
- Links must be public `https` URLs with a hostname (no IPs, localhost, credentials). Clicks go through `/promo/click/:id`, which redirects **only** to the stored, approved link and adds `utm_*` unless the link already has some.
- Optional creative image: PNG/JPEG/WebP, ≤ 300 KB, ≥ 160 px, aspect ratio between 1:2 and 4:1. The type and size come from the file's own header (`server/image-meta.ts`), never from the client's Content-Type. It is served from `/promo/img/:id` only while the campaign is live, with `nosniff` and `Content-Security-Policy: default-src 'none'`. No SVG upload, on purpose.
- Every card is labelled «إعلان». Impressions count once per browser session after the card is ≥ 50 % visible for one second. Counters are per day with no IP and no user id (`ad_daily_stats`).
- Company report: `/?ad-report=<token>` (JSON at `/promo/report/:token`). The token is the identity; only its SHA-256 is stored. It is shown once at creation (or when the requester submits), and an admin can issue a new one, which kills the old.
- Ready-made windows (Ramadan, Eid al-Fitr, national days, summer, back to school) fill the date fields from `src/lib/adSeasons.ts`. Hijri dates use the Umm al-Qura calendar and may differ by a day from local sighting, so the admin sees and can edit them.
- **Smart, profile-free targeting** (this platform has no colleges or demographics): the only thing known about a viewer is their *role*, sent as one word (`VISITOR | CONSUMER | CREATOR | HOST | SUPPLIER`; administrators browse as visitors so previews never skew numbers). A campaign names the roles it suits (empty = everyone) and the marketplace categories it follows (empty = any). Ranking per request: topic match first, neutral next, mismatched last; ties go to the campaign shown least today, so delivery stays even. Slot capacity is counted **per audience**: a creators-only and a hosts-only campaign can share the "exclusive" sponsor slot, but a campaign for everyone overlaps both. Widening the audience of an approved campaign sends it back to review (paused); narrowing never does.
- Politeness: each browser stops asking for ads after 60 impressions a day and can hide any single ad (✕, remembered locally). When no sponsor fits a market/portal slot, one of our own free gates is shown instead (labelled «من مجال», role-aware: shoppers → sell a business, hosts/creators/suppliers → supplier directory). The sponsor strip never shows house promotion.
- Company reports include a per-role breakdown of who saw the ad.
- **A/B test** (migration 29): a campaign may carry a second headline/tagline (`b_headline`, `b_tagline`); impressions and clicks are counted per variant (`ad_variant_stats`). `src/lib/abTest.ts` runs a two-proportion z-test once each variant has 500 impressions and only *recommends* a winner; nothing switches automatically.
- Not ported from the schedule repo's ads system: college targeting, pixel-quality scoring, partner-kit page, scheduled e-mail.

## 3. Facility team self-service
- `HOST_OWNER` only. Roles an owner can hand out: operations, chef, finance, marketing, support (never owner). Maximum 25 members + pending invites.
- `POST /api/v1/team/invites` → one-time link `/?invite=<token>` valid 7 days (hash stored, shown once). Re-inviting the same address replaces the older link. Addresses that already have an account are refused.
- The invitee sets name + password on the accept page; the invite is consumed by a conditional update, so a replay or double submit loses.
- Role change / suspend / remove run in a transaction and delete the member's sessions. A removed member keeps their account (history, audit) as a plain consumer with no tenant. Owners cannot edit themselves, and a member of another organisation is reported as not found.
- Invitations are **links only, by design**: the owner copies the link or sends it with the WhatsApp button (a `wa.me` link the owner's own phone opens). The platform sends no e-mail or SMS for invitations.

## 4. Free supplier directory (`DIRECTORY` surface)
- Same pattern as the business gate: `POST /api/v1/showcase/suppliers` (no account, 5/hour, honeypot, terms), admin reviews in *Approvals*, public `GET /suppliers` returns approved entries only; the contact name and notes stay private and the phone shows only with consent.
- The page also lists verified supplier *accounts* from the ecosystem (`موثّق في مجال` badge, no phone). Free entries are explicitly "formal review only": no claim about quality or prices.
- Deliberately clean: no ad strip on this surface, search + category chips, platform-drawn category art, WhatsApp/call buttons.
- Table `supplier_directory` (migration 24).

## 5. Audience dashboard and partner kit
- **Measured, anonymous, aggregate** (`server/audience.ts`, migration 26): the client reports "this browser opened page X as role Y" at most once per browser per page per day (`localStorage`), plus one *first page today* flag that makes the unique-browsers-per-day counter. Stored as day × page × role counters only; no IP, user id, cookie value or fingerprint. Administrator visits are never reported, and demo mode reports nothing. Browsers that block storage can be counted more than once.
- **Admin → «لوحة الجمهور»** (**SUPER_ADMIN only**, enforced on the server; ordinary administrators get 403 and do not see the tab; the public never sees it — companies only see the curated partner kit through the private link, and private-link pages carry `noindex`): browsers today / 7 / 30 days, page views, 30-day trend, busiest weekday, split by role and by page, real platform counts (creators, verified facilities and suppliers, live launches, open jobs, businesses for sale, directory suppliers), gate performance (opens and contact taps with the five most-viewed listings/suppliers), ad totals and slot load, and partner-link management. In demo mode the page shows generated numbers and says so.
- **Partner kit** (`/?partners=<token>`): the same real figures as a clean page for a company (traffic, who visits and where, who they would sit beside, slots and availability, targeting options, free and no-prices statement, request form). One private link; only its hash is stored; rotating it kills the old one. Nothing personal is exposed.
- **Seller / supplier report** (`/?my-report=<token>`): whoever submits a business or supplier receives, once, a private link (hash stored) to a page with their own opens, contact taps and 30-day trend; no personal data of visitors, `noindex`. Migration 27.
- Measurement starts the day it ships and does not backfill; the pages say so.

## 6. Notifications by role
Producers live in the routes and write to `notification_inbox` through `server/notify.ts` (recipients come from the database, never from the request; the actor is excluded; repeated events coalesce on a dedupe key; a failure to notify never fails the action). The bell shows the inbox; email/push still need providers linked.

| Event | Told |
|---|---|
| Public ad / business / supplier submission, job submission, supplier verification request | admins (`ADMIN_REVIEW`, `admin-pending:<kind>`) |
| Recipe access requested | the creator |
| Recipe access approved / revoked | facility owner, ops, chef |
| Offer sent / counter-offer | the other side |
| Offer accepted | the offer's sender |
| Contract signed / fully signed | the other side / both |
| Launch live | the creator |
| First paid order of a launch | facility money roles + creator |
| Verified customer review | facility + creator |
| Settlement approved / paid | the creator |
| Job approved or rejected | whoever posted it |
| Job application | the employer (facility deciders or supplier owner) |
| Supplier verification decision | the supplier |
| Colleague joined by invite | facility owner |

Covered by `server/notifications-roles.test.ts` (jobs and team, including that other roles and other facilities see nothing); the rest are exercised through their route suites.

## Data
Migrations 22–29: `business_listings`, `ad_campaigns`, `ad_daily_stats`, `organization_invites`, `supplier_directory`, `audience_daily`, `gate_events`, `partner_kit`, plus `ad_campaigns.image_mime/image_data`. Admin actions are written to `domain_audit_events`.

## Tests
All server suites run on in-memory SQLite by default and on a throw-away PostgreSQL database when `TEST_DATABASE_URL` is set (`server/test-db.ts`); both were run green for this module. Also `server/audience.test.ts`.
`server/showcase.test.ts`, `server/showcase-admin.test.ts` (real admin and owner sessions: review, capacity, creatives, token rotation, tenant isolation, session revocation), `server/team.test.ts`, `src/lib/adSeasons.test.ts`.
