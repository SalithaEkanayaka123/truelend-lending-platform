# Aesthetic direction — TrueLend mockups

**Note on process.** The design-render skill instructs invoking the
`frontend-design` skill before writing any mockup. No `frontend-design`
skill file exists in this installation (`.claude/skills/frontend-design/`
is absent and no plugin skill of that name resolved), so the direction
below is set directly from `specs/ui_spec.md` §1–4, which is itself an
already-approved, highly specific design system for this project — not a
blank slate the generic skill guidance was written for. Where the generic
mockup reference (`.claude/skills/design/references/ui-mockups.md`)
suggests a "characterful display font, not Inter," this project's own
`specs/ui_spec.md` §4.2 pins `--font-sans` to Inter for both body and
headings; a project's own committed, reviewed token system overrides the
generic skill default. These mockups do not introduce a font the UI spec
did not choose.

## Direction

- **Tone:** consumer-grade fintech — calm, trustworthy, generous
  whitespace, one strong accent colour (`--primary` `#0F5FDB`), plain-
  language copy. Reason codes always pair with their customer-readable
  message (ui_spec §1.1).
- **Typography:** Inter for everything (`--font-sans`), tabular figures on
  every money/score/count (`font-variant-numeric: tabular-nums`), the
  monospace `--font-mono` scale reserved for hashes/IDs. No raw hex, no
  off-scale font size — every mockup uses the exact custom-property values
  from `specs/ui_spec.md` §4.
- **Colour:** light theme only for P0 (dark mode is P1, out of scope for
  these three mockups). Status colour is always paired with a text label
  and an icon, never colour alone (ui_spec §4.1).
- **Spatial language:** mobile-first; the three mockups below are the exact
  P0 screens the stories require — a three-step apply wizard, a
  table/card-dual verification queue, a decision/override panel, and a
  per-product policy threshold form — nothing added, nothing invented.
  `--radius-md`/`--shadow-1` cards, 16/24/32px gutters at xs/md/lg,
  44px minimum touch targets.
- **Motion:** route-change fade+rise, dialog fade+scale, row-removed
  collapse — all from ui_spec §9, implemented with vanilla CSS transitions
  honouring `prefers-reduced-motion`.
- **Build choice:** plain HTML + CSS custom properties + vanilla JS,
  **not** the generic reference's CDN React/Tailwind default. Reason:
  decision D-B rules out Tailwind in production and commits to CSS modules
  over `:root` tokens; a mockup built the opposite way would be a visual
  contract the real implementation could not honour. Vanilla JS keeps the
  mockup self-contained with zero CDN dependency risk.

## Screens

| File | Story | Screens (ui_spec ID) |
|---|---|---|
| `E2-S4.html` | E2-S4 | Apply: Product (S-A-2), Apply: Details (S-A-3), Apply: Documents and submit (S-A-4), Verification queue (S-U-2) |
| `E3-S6.html` | E3-S6 | Application review — decision panel, review actions, override dialog (S-U-4, M1 subset: no disbursement form, that is M2) |
| `E4-S2.html` | E4-S2 | Policy editor (S-M-4, M1 subset: no Approve action, that is an ADMIN-only action out of this story's scope_in) |

Every data field shown matches `specs/design/api-contracts.schema.json` /
`data-models.schema.json`. Values are the seeded demo data from
`specs/features/F0-platform.md` (users) and `F1-product-catalog.md`
(policy version 1 PERSONAL/VEHICLE/EDUCATION thresholds).
