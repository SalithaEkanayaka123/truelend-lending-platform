# UI Spec

- **Parent:** `specs/app_spec.md` · **Features:** `specs/features/F1..F5` · **Root rules:** `CLAUDE.md` (design bar), `frontend/CLAUDE.md`
- If this spec and the feature specs disagree on behaviour, the feature spec wins. This file owns look, layout, states and the screenshot list.
- The UI shows decisions; it never makes them. All money, scores, buckets and reason codes come from the API.

## 1. Principles

1. **Consumer-grade fintech.** Calm, trustworthy, generous whitespace, one strong accent colour, plain-language copy. Reason codes always appear with their customer-readable message.
2. **Role-shaped.** Each role gets its own shell, navigation and landing screen. A user never sees links to screens they cannot open.
3. **Live validation.** Inline errors appear on blur and as the user types after the first error; submit is disabled while invalid. Ranges come from `GET /api/products`, so the UI never hardcodes policy values.
4. **Money is a string.** Display only: format by grouping the digits of the string in threes (`"92115.12"` → `₹92,115.12`), matching the feature specs. No `Number` arithmetic on money. Charts may scale bar lengths from the strings at the chart boundary only; no derived money value is ever shown (NFR-01).
5. **No PII in the console or logs.** Show `pan_masked` and `aadhaar_masked` exactly as returned. Never log application data. Never render document file contents; only the filename the user typed.
6. **Works with AI off.** No screen depends on the AI runtime. Any AI-proposed text is labelled "Suggestion" and never pre-fills a decision control.

## 2. Roles and shells

The brief names three user-facing roles. `POLICY_EDITOR` is a restricted admin and uses the Admin shell with only the Policies section.

| Role | Shell | Landing | Primary nav |
|---|---|---|---|
| Applicant (`CUSTOMER`) | Top bar, bottom tab bar on mobile | My applications | My applications · Apply · Loans |
| Underwriter (`UNDERWRITER`) | Left rail on desktop, top bar + drawer on mobile | Work queue | Work queue · Verification · Applications |
| Admin (`ADMIN`, `POLICY_EDITOR`) | Left rail on desktop, top bar + drawer on mobile | Portfolio dashboard | Dashboard · Applications · Policies · Audit · Jobs |

- **Sign in** (F0) is shared. It posts `/api/auth/login`, then routes by the returned `role`. Token lifetime is 1800 s; on a 401 mid-session the UI returns to Sign in and keeps the intended route.
- A 403 from the API shows the "No access" state (section 7), not a blank page. A customer opening someone else's resource gets 404, shown as "Not found".

## 3. Screens per role

IDs are `S-<role letter>-<n>`: A applicant, U underwriter, M admin. Each lists the feature, endpoints and the acceptance criteria that the screen carries.

**Priority (`Pri`).** **P0** is a screen on the demo path: apply, track, underwrite (including verification and override), disburse, repay, and the admin dashboard, plus sign-in and the landing screens that reach them. **P1** is stretch: anything off that path, and all dark-mode work. Build and polish every P0 screen (states, responsive, accessibility, screenshots) before starting any P1 screen. A P1 screen's nav entry stays hidden until the screen ships; its route may be absent.

### 3.1 Shared

| ID | Pri | Screen | Feature | Endpoints | Notes |
|---|---|---|---|---|---|
| S-0-1 | P0 | Sign in | F0 | `POST /api/auth/login`, `GET /api/auth/me` | Email, password, inline errors. Same message for wrong email or password (E0-S1-AC2). Demo accounts listed from the README, not the spec. |
| S-0-2 | P1 | Not found / No access / Session expired | F0 | none | Reused full-page states. |

### 3.2 Applicant

| ID | Pri | Screen | Feature | Endpoints | ACs | Key content |
|---|---|---|---|---|---|---|
| S-A-1 | P0 | My applications | F5 | `GET /api/applications` | E5-S1-AC5 | Cards on mobile, table on desktop. Status badge, product, amount, decision. Status filter chips. Pagination. |
| S-A-2 | P0 | Apply: Product | F1, F2 | `GET /api/products` | E2-S4-AC1 | Three product cards with rate, amount range, tenure range, required documents. Selected card is outlined. |
| S-A-3 | P0 | Apply: Details | F2 | `POST /api/applications` | E2-S4-AC1, E2-S4-AC2, E2-S1-AC3, E2-S1-AC4 | Amount, tenure, age, monthly income, three credit-flag toggles, PAN, Aadhaar. Range hints under each field ("12–60 months"). PAN and Aadhaar format errors inline. Creates the `DRAFT` on Continue. |
| S-A-4 | P0 | Apply: Documents and submit | F2, F3 | `POST /api/applications/{id}/documents`, `POST .../submit`, `POST .../underwrite` | E2-S4-AC1, E2-S2-AC1..AC5 | Checklist for the product. Each row: Missing / Uploaded. Upload sends `{type, filename}` only (stub). Submit disabled until every row is Uploaded; on 409 `MISSING_DOCUMENTS` the missing rows are highlighted. After submit the UI calls underwrite and routes to S-A-5. |
| S-A-5 | P0 | Application tracking | F5, F3 | `GET /api/applications/{id}` | E5-S3-AC1..AC5 | Status stepper (Submitted, Underwriting, Decision, Disbursed, Repaying) with the current step highlighted. Decision card: score, reason codes with messages, policy version. Missing-documents panel with an Upload action when applicable. Rejected documents show the verifier's reason and allow re-upload. Link to the loan when `loan_id` is set. |
| S-A-6 | P1 | My loans | F4 | `GET /api/applications` (filter to `DISBURSED`), `GET /api/loans/{id}` | E4-S4-AC4 | List of disbursed loans: outstanding principal, bucket badge, next due. |
| S-A-7 | P0 | Loan detail and repayment | F4 | `GET /api/loans/{id}`, `GET /api/loans/{id}/schedule`, `POST /api/loans/{id}/repayments` | E4-S4-AC4, E4-S4-AC5, E4-S3-AC6 | Summary tiles (principal, EMI, outstanding, total payable, bucket). 12..n row schedule: table on desktop, stacked cards on mobile, each row badged Paid / Partial / Due / Overdue. Repayment form with inline "exceeds remaining" error before submit; success updates outstanding and bucket without reload. |

### 3.3 Underwriter

| ID | Pri | Screen | Feature | Endpoints | ACs | Key content |
|---|---|---|---|---|---|---|
| S-U-1 | P0 | Work queue | F5, F3 | `GET /api/applications?status=MANUAL_REVIEW` | E5-S1-AC4 | Applications awaiting review, oldest first, with score and reason code. Counts for Manual review and Awaiting disbursement at the top. |
| S-U-2 | P0 | Verification queue | F2 | `GET /api/verification-queue`, `POST /api/documents/{id}/verify` | E2-S4-AC3, E2-S3-AC1..AC5 | Table on desktop, cards on mobile. Verify and Reject actions open a reason dialog (1–500 characters, counter). A verified item leaves the list without a reload. |
| S-U-3 | P1 | Applications | F5 | `GET /api/applications` | AC-10, E5-S1-AC1..AC3 | Same list as S-M-2 without Policies and Audit. Status and product filters reflected in the URL query. |
| S-U-4 | P0 | Application review | F3, F2, F4 | `GET /api/applications/{id}`, `POST .../review`, `POST .../override`, `POST .../disbursements` | E3-S5-AC1..AC3, E3-S4-AC1..AC5, E4-S2-AC1..AC5 | Panels: applicant details (masked identifiers), documents with statuses, decision (score, reason codes with messages, policy version), actions. **Manual review:** reason field plus Approve and Reject, both disabled while the reason is empty. **Auto-reject:** Override opens a dialog with a reason-code select (from the policy's override codes) and a comment; Submit disabled until both are set; success shows a confirmation. **Approved:** Disburse form with funding source and optional date; 409 `DOCUMENTS_NOT_VERIFIED` lists the blocking documents. At 375×812 the panels stack. |

### 3.4 Admin

| ID | Pri | Screen | Feature | Endpoints | ACs | Key content |
|---|---|---|---|---|---|---|
| S-M-1 | P0 | Portfolio dashboard | F5 | `GET /api/dashboard/portfolio?as_of=` | E5-S4-AC3, E5-S2-AC1..AC5 | KPI tiles: Total overdue, NPA count, Active loans. Bar chart by product. Bucket chart. `as_of` date picker (default today). Last-updated stamp. |
| S-M-2 | P1 | Applications | F5 | `GET /api/applications` | E5-S4-AC4, E5-S1-AC1..AC3 | Status and product filters combine; URL query mirrors them; no full page reload. Pagination footer. Row opens S-U-4 (admin may override and disburse). |
| S-M-3 | P1 | Policies | F1 | `GET /api/policies`, `GET /api/policies/{v}` | E1-S3-AC3 | Version list: number, status badge (Draft / Approved), hash (shortened), created and approved by. Active version marked. |
| S-M-4 | P1 | Policy editor | F1 | `POST /api/policies`, `POST /api/policies/{v}/approve` | E1-S3-AC1..AC3, E1-S2-AC1..AC6 | Pre-filled from the base version. One form card per product, one column on mobile. Inline cross-field errors (age range, tenure range, amount range, score thresholds) before submit; Save disabled while invalid. Saving shows "Draft v2" and the list updates. Approve is shown to `ADMIN` only and asks for confirmation. Approved versions are read-only: no edit control exists. |
| S-M-5 | P1 | Audit log | F0 | `GET /api/audit` | E0-S2-AC3 | Filters: entity type, entity id, action. Rows ascending by id: time, actor, role, action, entity, reason code, comment, before and after status. Read-only. |
| S-M-6 | P1 | Jobs | F4 | `POST /api/admin/jobs/end-of-day` | E4-S4-AC1..AC3 | "Run end-of-day" with `as_of` picker. Result card shows `processed` and `changed`. Invalid date shows an inline error. Re-running shows `changed: 0` without alarm. |

### 3.5 Route map

| Route | Screen | Roles |
|---|---|---|
| `/sign-in` | S-0-1 | public |
| `/applications` | S-A-1, S-U-3, S-M-2 (by role) | all signed in |
| `/apply` | S-A-2..S-A-4 | CUSTOMER |
| `/applications/:id` | S-A-5 (CUSTOMER), S-U-4 (UNDERWRITER, ADMIN) | by role |
| `/loans` | S-A-6 | CUSTOMER |
| `/loans/:id` | S-A-7 | CUSTOMER (owner) |
| `/queue` | S-U-1 | UNDERWRITER |
| `/verification` | S-U-2 | UNDERWRITER |
| `/dashboard` | S-M-1 | ADMIN |
| `/policies`, `/policies/new` | S-M-3, S-M-4 | POLICY_EDITOR, ADMIN |
| `/audit` | S-M-5 | ADMIN |
| `/jobs` | S-M-6 | ADMIN |

Filters live in the query string (`?status=REJECTED&product=PERSONAL`). Route guards redirect by role; the API remains the authority.

## 4. Design tokens

Tokens are CSS custom properties on `:root`, overridden under `[data-theme="dark"]`. Components use tokens only: no raw hex, no pixel font sizes outside the scale. **P0 ships light theme only.** Dark mode (the dark column, the `prefers-color-scheme` follow and the user-menu toggle) is **P1**; the values are fixed and checked now so adding it is a token override, not a redesign.

### 4.1 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F8FA` | `#0E1116` | Page background |
| `--surface` | `#FFFFFF` | `#161B22` | Cards, dialogs, tables |
| `--surface-raised` | `#FFFFFF` | `#1C232C` | Menus, popovers |
| `--border` | `#E3E7ED` | `#2A323D` | Decorative hairlines and dividers only |
| `--border-strong` | `#788291` | `#6B7686` | Input, select, toggle and button outlines; any border that marks a control |
| `--text` | `#12171F` | `#E8ECF1` | Body |
| `--text-muted` | `#5B6676` | `#9AA6B5` | Secondary text, hints |
| `--primary` | `#0F5FDB` | `#5B9BFF` | Primary actions, links, focus |
| `--primary-contrast` | `#FFFFFF` | `#0B1220` | Text on primary |
| `--success` | `#117A4D` | `#3DD68C` | Approved, Paid, Current |
| `--warning` | `#9A5B00` | `#F2B84B` | Manual review, Partial, DPD-30 |
| `--danger` | `#B42318` | `#FF7B72` | Rejected, Overdue, NPA, errors |
| `--info` | `#3B5BDB` | `#8DA2FF` | Submitted, Draft |
| `--success-bg` / `--warning-bg` / `--danger-bg` / `--info-bg` | 10% tints of the above | 16% tints | Badge and alert fills, composited over `--surface` (badges and alerts sit on `--surface`, not `--bg`) |

**Contrast (computed).** Every pair was computed with the WCAG 2.x relative-luminance formula in both themes (throwaway script, not committed). Thresholds: 4.5:1 for text, 3:1 for UI components and focus indicators.

| Pair | Light (lowest of bg / surface / raised) | Dark (lowest) | Needs |
|---|---|---|---|
| `--text` on bg, surface, raised | 16.92 | 13.35 | 4.5 |
| `--text-muted` on bg, surface, raised | 5.48 | 6.41 | 4.5 |
| `--primary` as link text and focus ring | 5.37 | 5.71 | 4.5 text, 3 ring |
| `--primary-contrast` on `--primary` | 5.71 | 6.76 | 4.5 |
| `--success`, `--warning`, `--danger`, `--info` as text, icon or chart fill on bg / surface | 5.05 | 6.86 | 4.5 |
| Each status colour on its own `-bg` tint | 4.68 (success) | 5.34 (danger) | 4.5 |
| `--text` on each `-bg` tint | 15.25 | 10.43 | 4.5 |
| `--text-muted` on each `-bg` tint | 4.94 | 5.01 | 4.5 |
| `--border-strong` on bg / surface / raised | 3.66 | 3.44 | 3 |

**Fix applied.** The first draft used `--border` for input outlines at 1.17–1.24:1 (light) and 1.22–1.46:1 (dark), below the 3:1 that WCAG 1.4.11 requires for a control's boundary. `--border` is now decorative only, and controls use the new `--border-strong`, which passes on every background in both themes. All text and status pairs already passed; no other value changed. A control that is identified by fill or text (a filled primary button) may omit the outline, since its fill already passes 3:1 against the page.

The Playwright accessibility run (section 10) repeats the check on the rendered screens.

Status colour mapping (always paired with a text label and an icon, never colour alone):

| State | Token |
|---|---|
| `DRAFT`, `SUBMITTED` | info |
| `MANUAL_REVIEW`, `PARTIAL`, `DPD-30`, `DPD-60` | warning |
| `APPROVED`, `DISBURSED`, `PAID`, `CURRENT`, `VERIFIED` | success |
| `REJECTED`, `OVERDUE`, `DPD-90`, `NPA` | danger |
| `MISSING`, `PENDING_DISBURSAL`, `CLOSED` | text-muted |

### 4.2 Typography

| Token | Value |
|---|---|
| `--font-sans` | `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` (hashes, ids) |
| Scale | `--text-xs` 12 · `--text-sm` 14 · `--text-base` 16 · `--text-lg` 18 · `--text-xl` 22 · `--text-2xl` 28 · `--text-3xl` 36 (px, as `rem`) |
| Weights | 400 body · 500 labels · 600 headings and figures |
| Line height | 1.5 body · 1.25 headings |
| Figures | `font-variant-numeric: tabular-nums` on every money, score and count |

Body text is never below 16px on mobile inputs (prevents iOS zoom). Load Inter with `font-display: swap`.

### 4.3 Spacing, radius, elevation, motion

| Token | Value |
|---|---|
| `--space-1..8` | 4, 8, 12, 16, 24, 32, 48, 64 px |
| `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-pill` | 6 / 10 / 16 / 999 px |
| `--shadow-1` | `0 1px 2px rgb(16 24 40 / 6%)` (cards) |
| `--shadow-2` | `0 8px 24px rgb(16 24 40 / 12%)` (menus, dialogs) |
| `--focus-ring` | `0 0 0 3px` of `--primary` at 40% over a 2px `--bg` gap |
| `--duration-fast` / `--duration-base` / `--duration-slow` | 120 / 200 / 320 ms |
| `--ease-out` / `--ease-in-out` | `cubic-bezier(0.2,0,0,1)` / `cubic-bezier(0.4,0,0.2,1)` |
| `--tap-min` | 44px (touch targets) |

### 4.4 Core components

All live in `ui/components/`, one per file: `Button`, `IconButton`, `TextField`, `MoneyField`, `Select`, `Toggle`, `StatusBadge`, `Card`, `StatTile`, `Stepper`, `DataTable`, `RecordCard` (mobile row), `Dialog`, `ConfirmDialog`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `Pagination`, `FilterChips`, `BarChart`, `BucketChart`, `ScoreGauge`, `AppShell`, `NavRail`, `TabBar`.

`MoneyField` accepts digits and one decimal point, enforces 2 decimals, and holds its value as a string. `DataTable` and `RecordCard` render from the same row model so the table and card views never drift.

## 5. Responsive breakpoints

Mobile first. Layout changes at these widths (min-width):

| Name | Min width | Layout |
|---|---|---|
| `xs` | 0 | Single column, bottom tab bar (applicant), top bar + drawer (staff), stacked cards, full-width buttons |
| `sm` | 480px | Two-column KPI tiles; forms still single column |
| `md` | 768px | Left rail appears for staff; tables replace cards; two-column forms |
| `lg` | 1024px | Dashboard grid (3 tiles across); review page shows applicant, documents and decision side by side |
| `xl` | 1280px | Content max-width 1200px, centred; reference desktop size |

Rules:

- Every screen is checked at **375×812** and **1280×800** with no horizontal scroll. Wide data uses stacked `RecordCard`s below `md`, never a scrolling table.
- Side gutter 16px at `xs`, 24px at `md`, 32px at `lg`.
- Touch targets are at least 44×44px; spacing between adjacent targets at least 8px.
- Dialogs are bottom sheets at `xs` (full width, rounded top corners) and centred modals from `md`.
- Charts reflow: horizontal bars at `xs`, vertical bars from `md`. Legends move below the chart at `xs`.
- Respect safe-area insets for the bottom tab bar (`env(safe-area-inset-bottom)`).

## 6. Data patterns

### 6.1 Forms and validation

- Validate on blur, then on change once a field has errored. Errors sit under the field in `--danger`, linked with `aria-describedby`.
- Range hints are shown before the user types (for example "₹50,000.00 – ₹1,500,000.00").
- Server errors with a field name map onto that field; others show in an alert at the top of the form (section 7).
- A submit button shows a spinner and is disabled while the request is in flight. A double click sends one request.

### 6.2 Tables and cards

- Sort is by server order (stated per screen); the UI does not re-sort pages.
- Pagination uses `limit` and `offset` with `total`; default 20.
- Empty cells show `—`. Dates show `DD MMM YYYY` in the user's locale; timestamps also show a relative form on hover.

## 7. Loading, empty and error states

Every screen that fetches data implements all four states. Components: `Skeleton`, `EmptyState`, `ErrorState`.

| State | Behaviour |
|---|---|
| **Loading (first load)** | Skeleton blocks matching the final layout (tiles, table rows, cards) so nothing jumps. Show after 150 ms to avoid flashes. `aria-busy="true"` on the region. |
| **Loading (refetch)** | Keep the old content, dim by 60% and show a thin progress bar under the header. Never blank the screen. |
| **Submitting** | Button spinner and disabled; dialogs stay open; inputs read-only. |
| **Empty** | Icon, one-line explanation, one action. Per screen below. |
| **Error (page)** | `ErrorState`: plain message, `correlation_id` from the error envelope in small muted text with a Copy button, and a Retry button. No stack traces. |
| **Error (inline)** | Alert above the form or beside the failing control, `role="alert"`. |
| **Offline / network** | "You appear to be offline" banner; actions that need the network are disabled; Retry on reconnect. |
| **401** | Go to Sign in with "Your session has expired", then return to the intended route. |
| **403 / 404** | "No access" / "Not found" full-page state with a button to the role's landing screen. |

Empty states per screen:

| Screen | Message | Action |
|---|---|---|
| S-A-1 | "You have no applications yet." | Start an application |
| S-A-6 | "No active loans." | View my applications |
| S-U-1 | "Nothing is waiting for review." | Open Applications |
| S-U-2 | "All documents are verified." | none |
| S-U-3, S-M-2 | "No applications match these filters." | Clear filters |
| S-M-1 | Tiles show `₹0.00` and `0`; charts show "No loans yet" in place of bars. | none |
| S-M-3 | "No policy versions." (should not occur after seed) | none |
| S-M-5 | "No audit entries match." | Clear filters |

Error copy is written for the customer, not the developer. Map API codes to messages in one place (`config/messages.ts`): for example `MISSING_DOCUMENTS` → "Upload the documents marked Missing, then submit again." `ALREADY_SUBMITTED`, `ALREADY_DECIDED`, `NOT_OVERRIDABLE`, `DOCUMENTS_NOT_VERIFIED`, `AMOUNT_EXCEEDS_REMAINING` and the 422 `VALIDATION_ERROR` fields each get a message. An unmapped code falls back to the envelope's `message`.

## 8. Charts

Charts are SVG, drawn by our own `BarChart`, `BucketChart` and `ScoreGauge` components so they respect tokens, dark mode and the money rule. No chart library is required.

| Chart | Screen | Data | Form |
|---|---|---|---|
| By-product bar chart | S-M-1 | `by_product[]`: applications, active loans, outstanding principal, overdue | Grouped bars per product (PERSONAL, VEHICLE, EDUCATION). Toggle between "Outstanding" and "Overdue". Value label on each bar. |
| Bucket chart | S-M-1 | `buckets{}`: loans per CURRENT, DPD-30, DPD-60, DPD-90, NPA | Ordered bars with the status colours from section 4.1 (success to danger). NPA bar is labelled and outlined. |
| KPI tiles | S-M-1 | `total_overdue`, `npa.count`, count of active loans | `StatTile` with label, figure, and a small caption ("as of 20 Mar 2026"). Overdue tile turns danger-tinted when above `"0.00"` (string comparison on a normalised string, not `Number`). |
| Score gauge | S-A-5, S-U-4 | `score` (300–900 scale) | Semicircle with the policy's auto-reject and auto-approve thresholds marked on the arc. Figure in the centre. The arc position is presentation only. |
| Repayment progress | S-A-7 | outstanding vs principal | Horizontal bar of principal repaid. Label shows the outstanding string from the API. |

Chart rules:

- Each chart has a text title, a visible legend or direct labels, and a **data table alternative** (a visually hidden `<table>` plus a "View as table" toggle) so the numbers are available without sight or hover.
- Colour is never the only channel: bars carry value labels and patterns (hatching on the NPA bar); legends use shapes plus text.
- Tooltips open on hover and focus, close on Escape, and are also reachable by keyboard arrow keys between bars.
- Axes show only the labels the shapes need; money axis ticks use the same string formatter as the rest of the app.
- Empty and loading states per section 7. Charts redraw within `--duration-slow`; respect reduced motion.
- No float arithmetic leaks into labels: bar lengths may be computed from strings at the chart boundary, but every printed figure is a string from the API.

## 9. Transitions and motion

| Interaction | Motion | Duration / easing |
|---|---|---|
| Route change | Content fades and rises 8px | `--duration-base`, `--ease-out` |
| Wizard step change | Slide 24px in the direction of travel, cross-fade | `--duration-base`, `--ease-in-out` |
| Dialog open / close | Fade + scale 0.98 → 1 (centred); slide up (sheet) | `--duration-base` / `--duration-fast` |
| Toast | Slide in from top (mobile) or bottom-right (desktop), auto-dismiss 5 s, pause on hover and focus | `--duration-base` |
| Button press | Scale 0.98, colour shift | `--duration-fast` |
| Row removed from queue | Collapse height and fade, then remove from the DOM | `--duration-base` |
| Skeleton | Soft shimmer sweep | 1.4 s loop |
| Chart bars | Grow from the baseline on first paint; transition on data change | `--duration-slow`, `--ease-out` |
| Stepper progress | Fill the connector to the current step | `--duration-slow` |
| Status badge change | Cross-fade colour after a successful action | `--duration-base` |

- Animate `transform` and `opacity` only; never animate layout properties on large lists.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, replace slides, scales and shimmer with instant changes or a plain cross-fade of at most `--duration-fast`. Charts render at final size.
- Nothing auto-advances or plays continuously other than the skeleton shimmer (disabled under reduced motion).

## 10. Accessibility

Target: **WCAG 2.2 AA** on every screen.

- **Structure:** one `<h1>` per screen; landmarks `header`, `nav`, `main`, `footer`; a "Skip to content" link first in tab order.
- **Keyboard:** every control is reachable and operable by keyboard in a logical order. No keyboard traps. Visible `--focus-ring` on all focusable elements (never `outline: none` without a replacement).
- **Dialogs:** `role="dialog"`, `aria-modal`, labelled by the title; focus moves in on open, is trapped, and returns to the trigger on close; Escape closes unless a request is in flight.
- **Forms:** every input has a visible `<label>`; required fields are marked in text; errors are announced (`role="alert"` or `aria-live="polite"`) and linked with `aria-describedby`; `autocomplete` attributes on identity fields; numeric fields use `inputmode`. PAN and Aadhaar inputs are `type="text"` with `autocomplete="off"`.
- **Status and live regions:** status badges include text, not only colour. Updates after an action (verified, repayment posted, filter applied) are announced via a polite live region.
- **Tables:** real `<table>` with `<th scope>` and a caption on desktop. Mobile `RecordCard`s are a `<ul>` of items with the same labels and values in the same order.
- **Colour and contrast:** section 4.1 pairs meet AA; UI components and focus indicators meet 3:1. Information is never colour-only.
- **Touch:** targets at least 44×44px (section 4.3).
- **Zoom and reflow:** usable at 200% zoom and at 320px width without loss of content or two-direction scrolling.
- **Motion:** section 9 reduced-motion rules.
- **Language:** `<html lang="en">`. Money reads naturally to screen readers: the visible `₹92,115.12` carries `aria-label="92,115 rupees and 12 paise"`.
- **Testing:** an automated axe run in Playwright on every screenshot route (section 11) must report no serious or critical violations; Vitest component tests use accessible queries (`getByRole`, `getByLabelText`) so a missing label fails the test.

## 11. Screenshots for the README (Playwright)

Captured by `e2e/screenshots.spec.ts` against the demo seed (`TRUELEND_SEED_DEMO=1`, synthetic data only) and written to `docs/screenshots/<id>-<viewport>.png`. Each shot uses a fixed `as_of` where one applies, so the output is reproducible. Each shot waits for the loaded state (no skeletons visible), disables animations (`reducedMotion: 'reduce'`) and hides any `correlation_id`.

Viewports: **desktop** 1280×800 and **mobile** 375×812 unless noted. Light theme for all. A `*` marks a dark-theme variant, which is **P1** whatever the row's priority; the row's `Pri` applies to the light shot. Capture P0 rows first; the README ships with P0 only if P1 is not ready.

| # | Pri | File stem | Screen | Signed in as | Seed state shown | Viewports |
|---|---|---|---|---|---|---|
| 1 | P0 | `01-sign-in` | S-0-1 | none | Sign-in form | desktop, mobile |
| 2 | P0 | `02-apply-product` | S-A-2 | customer1 | Product cards | mobile |
| 3 | P0 | `03-apply-details-error` | S-A-3 | customer1 | Tenure 72 for PERSONAL with the inline "12–60 months" error | mobile |
| 4 | P0 | `04-apply-documents` | S-A-4 | customer1 | Checklist with a mix of Missing and Uploaded | mobile |
| 5 | P0 | `05-my-applications` | S-A-1 | customer1 | Applications 7, 2, 1 | desktop, mobile |
| 6 | P0 | `06-track-submitted` | S-A-5 | customer1 | Application 2, `SUBMITTED` stepper | mobile |
| 7 | P0 | `07-track-rejected` | S-A-5 | customer2 | Application 3, score 500, reason with message | mobile * |
| 8 | P0 | `08-loan-schedule` | S-A-7 | customer1 | Loan 1, schedule table / cards, Overdue badges at `as_of` 2026-03-20 | desktop, mobile |
| 9 | P0 | `09-repayment-posted` | S-A-7 | customer1 | After posting `8884.88`: outstanding `₹92,115.12`, bucket Current | desktop |
| 10 | P0 | `10-verification-queue` | S-U-2 | underwriter | Table (desktop) and cards (mobile) | desktop, mobile |
| 11 | P0 | `11-review-manual` | S-U-4 | underwriter | Application 6, `MANUAL_REVIEW`, score gauge, Approve and Reject disabled until reason | desktop, mobile |
| 12 | P0 | `12-override-dialog` | S-U-4 | admin | Application 3 override dialog with reason code and comment | desktop |
| 13 | P0 | `13-dashboard` | S-M-1 | admin | KPI tiles, by-product bar chart and bucket chart at `as_of` 2026-03-20 | desktop *, mobile |
| 14 | P1 | `14-dashboard-npa` | S-M-1 | admin | Same dashboard at `as_of` 2026-06-20 with the NPA loan | desktop |
| 15 | P1 | `15-applications-filtered` | S-M-2 | admin | `status=REJECTED&product=PERSONAL`, URL visible in the caption | desktop |
| 16 | P1 | `16-policy-editor` | S-M-4 | policy editor | Draft v2 saved, banner "Draft v2" | desktop, mobile |
| 17 | P1 | `17-audit-log` | S-M-5 | admin | Entries for application 3 | desktop |
| 18 | P1 | `18-states` | Loading, empty, error | admin | Skeleton dashboard, empty filter result, and error state side by side (composite) | desktop |

Rules for the README:

- The README embeds shots 5, 8, 11, 13 (desktop) and 6, 7 (mobile) inline, and lists the rest under a collapsed "More screens" section.
- Alt text for each image names the screen and what is visible. Captions give the role and viewport.
- No screenshot shows a token, a password, a full PAN or Aadhaar, or a real name; seed identifiers are already synthetic and masked.
- Screenshots are regenerated by `npx playwright test e2e/screenshots.spec.ts`; they are build artefacts of the demo, not test oracles. Layout assertions live in the per-feature Playwright specs listed in the feature specs.

## 12. Acceptance for this spec

A screen is done when:

1. It matches its row in section 3 and carries the listed ACs, with those tests tagged per the `ac-tagged-tests` skill.
2. Loading, empty, error and 401/403/404 behaviour follow section 7.
3. It passes at 375×812 and 1280×800 with no horizontal scroll.
4. It uses tokens only, passes the axe run with no serious or critical issues, and honours reduced motion.
5. It prints no money derived by the UI and logs no application data.

Priority order: every P0 screen is done by this definition before any P1 screen starts. Dark mode is P1 for all screens and is not part of P0 done.

## 13. Out of scope

Native apps; localisation beyond English; Indian digit grouping; offline mode beyond the banner; real file upload and preview; notifications; user management; theme editing by end users.
