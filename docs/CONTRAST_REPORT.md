# PULSE — CONTRAST REPORT (WCAG 2.2 AA)
Prepared by Chat 01 for Chat 07 (Security & QA). Date: 2026-11-16. Applies to `DESIGN_SYSTEM.md` v1.1.

## 1. Summary

| | Dark | Light |
|---|---|---|
| Pairs measured | 44 | 44 |
| Failing with v1.0 tokens | **9** | **21** |
| Failing with v1.1 tokens | **0** | **0** |
| Passing only under a usage rule (see Section 4) | 1 | 2 |

The ember identity is intact. In the dark theme the accent `#FF6A3D` is unchanged and already passes everywhere. In the light theme the fill moves from `#D9461A` to `#D44519` (a barely visible shift) and a separate, deeper `--accent-text` `#B03915` is used where ember appears as text.

**Status:** measurement complete. The v1.1 tokens are **proposed** and need owner sign-off. Not yet verified on a built app (Section 6).

## 2. Method and standards
- WCAG 2.x relative-luminance contrast ratio, sRGB, computed by script with the token hex values (rounded to 2 decimals; the pass/fail test uses unrounded values).
- **Thresholds:** normal text 4.5:1 (SC 1.4.3). UI component boundaries, state indicators and meaningful graphics 3:1 (SC 1.4.11). Focus indicators 3:1 against adjacent colours (SC 2.4.11/1.4.11). All text in the app is under 24 px or not bold-large, so no 3:1 large-text allowance is used.
- Semi-transparent `--accent-soft` was composited over `--s2` before measuring (reaction chips). Surfaces measured: `canvas`, `s1`, `s2`, `s3`.
- Not applicable (exempt by WCAG): disabled controls, purely decorative dividers and card outlines (`--border`, `--border-strong`), logo wordmark.
- Avatar initials on the 12 avatar tints: 7.9:1 or better (dark), 11.9:1 or better (light). All pass.
- `❌` in the Before column marks a v1.0 failure. `RULE` marks a pair that does not reach 4.5:1 and is handled by a usage rule (Section 4).

## 3. Failures found in v1.0 and the fixes

| # | Token / use | Theme | Problem | v1.0 | Fix (v1.1) | Result |
|---|---|---|---|---|---|---|
| 1 | `--text-faint` text (timestamps, system lines, receipts meta) | dark | 3.15 to 3.58:1 on canvas/s1/s2 | `#6F6C65` | `#89867E` | 4.54 to 5.15:1 |
| 2 | `--text-faint` text | light | 3.06 to 3.43:1 | `#8C877B` | `#706B61` | 4.53 to 5.07:1 |
| 3 | Control borders (inputs, search, toggles, segmented, outline buttons) | both | 1.3 to 1.7:1, so the control boundary is not perceivable (1.4.11) | `--border-strong` `#3D3D39` / `#C9C3B5` | New `--control`: `#6C6962` dark, `#8C867A` light | 3.01 to 3.47:1 |
| 4 | Accent as text on canvas/s1/s2 (links, "Use", unread text) | light | 3.71 to 4.16:1 | `#D9461A` | New `--accent-text` `#B03915` | 5.22 to 5.85:1 |
| 5 | Accent text on reaction chip (accent-soft over s2) | light | 3.26:1 | `#D9461A` | `--accent-text` `#B03915` | 4.59:1 |
| 6 | White label on accent button | light | 4.34:1 | `#D9461A` | `--accent` `#D44519` | 4.50:1 (limit case, see note) |
| 7 | `--live` as text; live dot/ring on s2/s3 | light | 2.93 to 3.28:1 text; 2.67 to 2.93:1 graphic | `#1E9E65` | `#177B4F` | 4.51 to 5.05:1 text; 4.12:1 on s3 |
| 8 | `--away` dot on s3 | light | 2.84:1 | `#B7791F` | `#B1751E` | 3.02:1 on s3, 3.31 to 3.70:1 elsewhere |
| 9 | `--danger` text on s2 | light | 4.31:1 | `#C93B38` | `#C53835` | 4.50:1 on s2 (limit case) |
| 10 | `--danger` text on s3 | dark | 4.29:1 | `#F0524F` | `#F15A57` | 4.52:1 |
| 11 | Lobby timer ring (`--text-faint` on s3) | both | 2.80 to 2.86:1 | v1.0 faint | v1.1 faint | 4.12 to 4.14:1 |

**Limit cases (6, 9):** these pass by 0.00 to 0.01 of margin. If the build changes the colour by even a rounding step (for example a CSS colour-space conversion), they could slip below 4.5:1. If the owner prefers margin, the alternatives are `--accent` `#CB4217` (white label 4.85:1) and `--danger` `#BF3431` (4.79:1 on s2), each a tiny visual change. Chat 07 should re-measure these two in the built app.

## 4. Remaining exceptions (handled by rules, not colour)

| Pair | Ratio | Why it is accepted | Rule |
|---|---|---|---|
| Faint text on `--s3` (dark) | 4.12:1 | Raising faint further would make it as bright as muted text and erase the hierarchy | Never use `--text-faint` on `--s3` (selected/hover rows, own-message hover). Use `--text-muted` (5.5:1 dark, 5.3:1 light) there. The mockups follow this (selected row time uses muted) |
| Faint text on `--s3` (light) | 4.14:1 | Same | Same |
| Danger text on `--s3` (light) | 4.11:1 | Needs a darker red that would shift the hue toward brown | Do not render danger-coloured text on `--s3`. Use an icon in `--danger` plus a `--text` label |

Chat 07 should add a lint-style check (or visual review item) for these three usages.

## 5. Usage rules that the results depend on
1. Ember text uses `--accent-text`. Ember fills, rules, focus rings and unread pills use `--accent`.
2. Interactive control outlines use `--control`; `--border` and `--border-strong` are decoration only.
3. `--text-faint` is never placed on `--s3`.
4. `--away` and `--offline` are dots and rings only (status is always also labelled in text: "Away", "Offline"), never the sole carrier of meaning and never text in the light theme.
5. Colour is never the only status signal (dot plus label; checkmarks plus "Seen by 3").
6. Unread count pill: `--on-accent` on `--accent` (6.6:1 dark, 4.5:1 light).

## 6. What is not covered (needs Chat 07 on the built app)
- Hover, pressed, selected and disabled states of every component; only the token pairs and the states in the mockups were measured.
- Text over images (user avatars, image attachments), toasts, tooltips, code/inline-code, link text inside messages, scrollbar thumbs, focus ring where it overlaps `--accent` elements.
- Real rendered colours after Tailwind v4's colour handling (check the computed values in DevTools against this table).
- Text spacing, zoom to 200 to 400 percent, reflow at 320 px, target size 24 px (SC 2.5.8), and reduced-motion behaviour.
- APCA is not used; WCAG 2.x ratios only, as AA requires.
- Colour-vision deficiency simulation of the green/amber/red status trio (labels already back them up; verify in practice).

## 7. Detailed results
Columns: pair, required ratio, v1.0 ratio, v1.1 ratio, result.

### Dark theme

| Pair | Need | Before | After | Result |
|---|---|---|---|---|
| Body text on canvas | 4.5 | 15.46 | 15.46 | PASS |
| Muted text on canvas | 4.5 | 6.93 | 6.93 | PASS |
| Body text on s1 | 4.5 | 14.66 | 14.66 | PASS |
| Muted text on s1 | 4.5 | 6.57 | 6.57 | PASS |
| Body text on s2 | 4.5 | 13.62 | 13.62 | PASS |
| Muted text on s2 | 4.5 | 6.11 | 6.11 | PASS |
| Body text on s3 | 4.5 | 12.34 | 12.34 | PASS |
| Muted text on s3 | 4.5 | 5.53 | 5.53 | PASS |
| Faint text on canvas | 4.5 | 3.58 ❌ | 5.15 | PASS |
| Faint text on s1 | 4.5 | 3.39 ❌ | 4.89 | PASS |
| Faint text on s2 | 4.5 | 3.15 ❌ | 4.54 | PASS |
| Faint text on s3 (selected/hover rows) | 4.5 | 2.86 ❌ | 4.12 | RULE |
| Accent text on canvas | 4.5 | 6.59 | 6.59 | PASS |
| Accent text on s1 | 4.5 | 6.25 | 6.25 | PASS |
| Accent text on s2 | 4.5 | 5.80 | 5.80 | PASS |
| Accent text on accent-soft chip (over s2) | 4.5 | 4.74 | 4.74 | PASS |
| Button label (on-accent) on accent | 4.5 | 6.61 | 6.61 | PASS |
| Button label on accent-hover | 4.5 | 7.69 | 7.69 | PASS |
| Danger text on canvas | 4.5 | 5.38 | 5.66 | PASS |
| Danger text on s1 | 4.5 | 5.10 | 5.36 | PASS |
| Danger text on s2 | 4.5 | 4.74 | 4.98 | PASS |
| Danger text on s3 | 4.5 | 4.29 ❌ | 4.52 | PASS |
| Live text on canvas | 4.5 | 10.90 | 10.90 | PASS |
| Live text on s1 | 4.5 | 10.33 | 10.33 | PASS |
| Live text on s2 | 4.5 | 9.60 | 9.60 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on canvas | 3.0 | 6.59 | 6.59 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s1 | 3.0 | 6.25 | 6.25 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s2 | 3.0 | 5.80 | 5.80 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s3 | 3.0 | 5.26 | 5.26 | PASS |
| Live dot/ring/progress on canvas | 3.0 | 10.90 | 10.90 | PASS |
| Live dot/ring/progress on s2 | 3.0 | 9.60 | 9.60 | PASS |
| Live dot/ring/progress on s3 | 3.0 | 8.70 | 8.70 | PASS |
| Away dot on canvas | 3.0 | 10.47 | 10.47 | PASS |
| Away dot on s1 | 3.0 | 9.93 | 9.93 | PASS |
| Away dot on s2 | 3.0 | 9.22 | 9.22 | PASS |
| Away dot on s3 | 3.0 | 8.36 | 8.36 | PASS |
| Danger icon on canvas | 3.0 | 5.38 | 5.66 | PASS |
| Danger icon on s2 | 3.0 | 4.74 | 4.98 | PASS |
| Offline dot on canvas | 3.0 | 3.58 | 3.58 | PASS |
| Offline dot on s1 | 3.0 | 3.39 | 3.39 | PASS |
| Control border (inputs, toggles, segmented) on canvas | 3.0 | 1.72 ❌ | 3.42 | PASS |
| Control border (inputs, toggles, segmented) on s1 | 3.0 | 1.63 ❌ | 3.24 | PASS |
| Control border (inputs, toggles, segmented) on s2 | 3.0 | 1.51 ❌ | 3.01 | PASS |
| Faint as graphic on s3 (lobby timer ring) | 3.0 | 2.86 ❌ | 4.12 | PASS |

### Light theme

| Pair | Need | Before | After | Result |
|---|---|---|---|---|
| Body text on canvas | 4.5 | 15.83 | 15.83 | PASS |
| Muted text on canvas | 4.5 | 6.15 | 6.15 | PASS |
| Body text on s1 | 4.5 | 16.67 | 16.67 | PASS |
| Muted text on s1 | 4.5 | 6.48 | 6.48 | PASS |
| Body text on s2 | 4.5 | 14.88 | 14.88 | PASS |
| Muted text on s2 | 4.5 | 5.78 | 5.78 | PASS |
| Body text on s3 | 4.5 | 13.59 | 13.59 | PASS |
| Muted text on s3 | 4.5 | 5.28 | 5.28 | PASS |
| Faint text on canvas | 4.5 | 3.26 ❌ | 4.82 | PASS |
| Faint text on s1 | 4.5 | 3.43 ❌ | 5.07 | PASS |
| Faint text on s2 | 4.5 | 3.06 ❌ | 4.53 | PASS |
| Faint text on s3 (selected/hover rows) | 4.5 | 2.80 ❌ | 4.14 | RULE |
| Accent text on canvas | 4.5 | 3.95 ❌ | 5.55 | PASS |
| Accent text on s1 | 4.5 | 4.16 ❌ | 5.85 | PASS |
| Accent text on s2 | 4.5 | 3.71 ❌ | 5.22 | PASS |
| Accent text on accent-soft chip (over s2) | 4.5 | 3.26 ❌ | 4.59 | PASS |
| Button label (on-accent) on accent | 4.5 | 4.34 ❌ | 4.50 | PASS |
| Button label on accent-hover | 4.5 | 5.42 | 5.42 | PASS |
| Danger text on canvas | 4.5 | 4.59 | 4.79 | PASS |
| Danger text on s1 | 4.5 | 4.83 | 5.04 | PASS |
| Danger text on s2 | 4.5 | 4.31 ❌ | 4.50 | PASS |
| Danger text on s3 | 4.5 | 3.94 ❌ | 4.11 | RULE |
| Live text on canvas | 4.5 | 3.11 ❌ | 4.80 | PASS |
| Live text on s1 | 4.5 | 3.28 ❌ | 5.05 | PASS |
| Live text on s2 | 4.5 | 2.93 ❌ | 4.51 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on canvas | 3.0 | 3.95 | 4.10 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s1 | 3.0 | 4.16 | 4.31 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s2 | 3.0 | 3.71 | 3.85 | PASS |
| Accent graphic (focus ring, rule, unread pill, nav bar) on s3 | 3.0 | 3.39 | 3.52 | PASS |
| Live dot/ring/progress on canvas | 3.0 | 3.11 | 4.80 | PASS |
| Live dot/ring/progress on s2 | 3.0 | 2.93 ❌ | 4.51 | PASS |
| Live dot/ring/progress on s3 | 3.0 | 2.67 ❌ | 4.12 | PASS |
| Away dot on canvas | 3.0 | 3.31 | 3.52 | PASS |
| Away dot on s1 | 3.0 | 3.49 | 3.70 | PASS |
| Away dot on s2 | 3.0 | 3.11 | 3.31 | PASS |
| Away dot on s3 | 3.0 | 2.84 ❌ | 3.02 | PASS |
| Danger icon on canvas | 3.0 | 4.59 | 4.79 | PASS |
| Danger icon on s2 | 3.0 | 4.31 | 4.50 | PASS |
| Offline dot on canvas | 3.0 | 3.26 | 3.26 | PASS |
| Offline dot on s1 | 3.0 | 3.43 | 3.43 | PASS |
| Control border (inputs, toggles, segmented) on canvas | 3.0 | 1.60 ❌ | 3.29 | PASS |
| Control border (inputs, toggles, segmented) on s1 | 3.0 | 1.68 ❌ | 3.47 | PASS |
| Control border (inputs, toggles, segmented) on s2 | 3.0 | 1.50 ❌ | 3.09 | PASS |
| Faint as graphic on s3 (lobby timer ring) | 3.0 | 2.80 ❌ | 4.14 | PASS |


## 8. v1.2 addendum: additional state pairs (2026-11-16)
Measured with the v1.1/v1.2 token values (no colour changes were made in v1.2).

| Pair | Need | Dark | Light | Result |
|---|---|---|---|---|
| Accent text on `--s3` (hovered/selected rows) | 4.5 | 5.26 | 4.76 | PASS both |
| Muted text on `--s3` (ghost-button hover, selected meta) | 4.5 | 5.53 | 5.28 | PASS both |
| Text on `--s3` (tooltip, menu hover) | 4.5 | 12.34 | 13.59 | PASS both |
| Placeholder (`--text-muted`) on `--s2` (inputs) | 4.5 | 6.11 | 5.78 | PASS both |
| Toast text on `--s2` | 4.5 | 13.62 | 14.88 | PASS both |
| Focus ring (`--accent`) on `--s3` | 3.0 | 5.26 | 3.52 | PASS both |
| Live text on `--s3` | 4.5 | 8.70 | **4.12** | Dark PASS, light RULE |
| Control border (`--control`) on `--s3` (outline button inside a selected row) | 3.0 | **2.73** | **2.82** | FAIL both, RULE |

**New rules (also in `DESIGN_SYSTEM.md` Section 2, rule 3):** on `--s3` surfaces use `--text-faint` for control borders (4.12 dark, 4.14 light, both pass 3:1); never use `--live` as text on `--s3` in the light theme. No palette value changed.

Residual pairs handled by rules (all in Section 4 plus this addendum): faint text on `--s3` (dark 4.12, light 4.14), danger text on `--s3` (light 4.11), live text on `--s3` (light 4.12). Control border on `--s3` is handled by using `--text-faint`.


## 9. v1.2.1 addendum: mobile mockup audit (2026-11-16)
Method: Chromium DOM audit of the rendered mobile frames (all 10 frames, dark and light): every text node's computed colour against its effective background, plus measured size of controls.
- **Text:** 22 distinct colour pairs per theme, **0 below 4.5:1** in both themes.
- **Touch targets:** all interactive controls are ≥ 44 px, except 36 px visual controls (`btn sm`, header chip, poll options) that use the invisible 44 px `hit-44` area. Adjacent ones keep ≥ 8 px gaps.
- **Excluded from audit:** status bar, generic keyboard placeholder, captions.
- **Not audited in DOM:** non-text graphics (3:1), covered only at token level (Sections 3 to 8). Built-app re-check remains with Chat 07.
