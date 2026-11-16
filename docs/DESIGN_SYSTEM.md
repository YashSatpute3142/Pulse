# PULSE — DESIGN SYSTEM v1.3 (FINAL, APPROVED, for implementation)
Owner: Chat 01 (UI/UX). Consumers: Chat 02 (Frontend), Chat 06 (Features), Chat 07 (QA), Chat 08 (DevOps).
Stack: React + Vite + **Tailwind CSS v4**. Date: 2026-11-16.

---

## 0. Status and Change Log

**The owner approved the visual design on 2026-11-16:** colour palette, logo, application layout, conversation screen, Live Activity cards and Focus Room screen. **The approved appearance is frozen.** v1.2 changes only technical issues, accessibility and missing responsive specifications. No colour, type, spacing, radius or layout shown in the approved mockups has changed.

### v1.3 (2026-11-16): mobile mockups OWNER-APPROVED (documentation-only release; no visual, token or spec change)
**The owner approved all six mobile mockups (Conversation, Live Activity, Focus Room, each in dark and light) on 2026-11-16.** The approved appearance is frozen like the desktop. Chat 01's design-phase deliverables are closed. Chat 01 still owes the design review of the implemented screens once Chat 02 has built them.

#### v1.2.1 content (mobile mockups; now approved)
Three mobile mockups (Conversation, Live Activity, Focus Room; dark and light) now visualise Section 6.4. No token, colour, type or desktop value changed. Details the mockups pin down (all inside the existing spec; Chat 02 should follow them):
- Phone frame 390×844, status bar 47, header 56, tab bar 90 (56 + 34 safe area). Search field 48; list rows ≥ 64 with a **42 px** avatar; composer min 48, send 44.
- Bottom sheets use the `--s1` surface; sheet rows 52 px; quick-reaction buttons 44.
- Activity page header holds a "Set activity" chip (36 visual, 44 hit); the conversation Details sheet lists members with presence and current activity.
- Spark collapses to a 44 px chip with a 44 px "Use" button and a 44 px dismiss.
- Focus Room: ring 240 (stroke 6), digits 56; Room chat opens as a sheet whose title carries the time left (the sheet covers the stage, so the timer is not visible behind it).
- **Hit-area rule:** controls drawn at 36 px (small buttons, header chip, poll options) rely on the invisible `hit-44` area; adjacent ones need ≥ 8 px gap so hit zones do not overlap.
- Files: `mockups/mobile/boards/*` (6 boards), `mockups/mobile/frames/*` (20 frames), `mockups/mobile/mobile.html`.
Verified: rendered in Chromium; DOM audit found 22 distinct text colour pairs per theme, 0 below 4.5:1. Not verified: real devices, iOS/Android keyboards (keyboard is a generic placeholder), graphics 3:1 in the DOM, tablet/laptop, sample data only.

### What changed from v1.1 (none of it alters the approved look at 1440 px)
| # | Change | Type | Why |
|---|---|---|---|
| 1 | Four-zone layout starts at **1280 px** (was 1200) | Responsive fix | At 1200 px the message pane would be 516 px wide. At 1440 px (the mockup) nothing changes |
| 2 | Added tablet (768–1023), laptop (1024–1279), wide (≥1536) and full mobile (<768) specifications | Missing specs | Only desktop was specified |
| 3 | Canonical token names fixed (`--text-muted`, not `--muted`) and `tokens.css` + `index.css` supplied and **test-compiled** with Tailwind 4.3 | Technical | v1.1 Tailwind mapping lacked the new tokens |
| 4 | Shadow token renamed `--elev-float` | Bug fix | `--shadow-float` mapped to itself, a circular variable that breaks the shadow |
| 5 | Added `--scrim`; avatar tints are now tokens `--av-1…6` | Technical | Needed by sheets/modals and Tailwind |
| 6 | Controls on `--s3` use `--text-faint` for their border; `--live` text never on `--s3` | Accessibility | Two measured gaps (Section 13) |
| 7 | Touch targets reach 44 px through an invisible hit area (`.hit-44`), visual sizes unchanged | Accessibility | SC 2.5.8 and touch usability |
| 8 | Form fields are 16 px on touch devices | Technical | iOS Safari zooms the page on focus below 16 px |
| 9 | Focus-ring, reduced-motion, forced-colors, `color-scheme` and theme-flash rules specified in code | Accessibility | Were prose only |
| 10 | Timer, message list, typing, presence and toast ARIA specified | Accessibility | Were generic |
| 11 | Specs for screens that have no mockup (auth, friends, settings, modals, canvas, states) written from approved components only | Missing specs | Chat 02 needs them. **Not visually reviewed** |
| 12 | Mobile tab bar shows text labels under icons | Accessibility (mobile only) | Icon-only tabs are hard to discover. Desktop rail stays icon-only as approved |
| 13 | Simplified favicon / app icon set produced | Missing deliverable | Was pending |
| 14 | Theme default is "system" (matches `User.settings.theme`) | Consistency | v1.0 said dark default and also system |

### Frozen (do not change without owner approval)
Palette values (Section 2), fonts and scale (3), radius/spacing (4), four-zone desktop layout (6), message layout, activity cards, focus room, logo, mark (8, 12).

---

## 1. Design Position

Pulse is a **tool for being with people**, not a marketing page. It should feel like well-made software: dense where it needs to be, quiet everywhere else, and visibly "alive" in a few precise places (presence, activity, the focus timer).

**One idea carries the identity: the pulse.** A living signal. It appears as the presence ring, the activity heartbeat, the focus-room ring and the logo's heartbeat. It appears *only* where something is actually live. If nothing is live, nothing moves.

### Anti-"AI slop" rules (binding; QA checks these)
| Do NOT | Do instead |
|---|---|
| Purple/blue/pink gradient anywhere, gradient text, gradient buttons | Flat warm colours; one accent (ember) |
| Glassmorphism / blur cards everywhere | Opaque surfaces separated by 1px borders and tone steps |
| Glow shadows, neon outlines | Elevation only on floating layers (menus, modals, toasts) |
| Everything `rounded-2xl` / pills | Radius by role (Section 4) |
| Centred hero, three identical feature cards, "Welcome to the future of…" copy | App-first screens; left-aligned; real content |
| Emoji as UI icons, decorative blobs/sparkles | One icon set (Lucide, 1.5px stroke); no decoration without function |
| Inter + generic system look | The approved type pairing (Section 3) |
| Lorem ipsum / "John Doe" / fake stats in the product | Real data, real empty states. (Sample names exist only in mockups.) |
| Animating everything | Motion only to show a state change or liveness |
| WhatsApp bubbles / Discord blurple + server rail | Pulse's own message layout and palette (Section 8) |
| Identical padding everywhere, eight greys | 4px spacing scale used with intent; four surface tones |

Test before shipping a screen: *"If I removed the logo, would this still look like Pulse?"*

---

## 2. Colour (FROZEN)

Warm neutrals + one signal accent + semantic state colours. System preference first, then the user's saved choice. Dark and light are both first-class.

**Source of truth: `frontend/src/styles/tokens.css` (supplied).** Values below are the same file in table form.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--canvas` | `#121211` | `#F6F4EF` | App background, main pane |
| `--s1` | `#181817` | `#FBFAF7` | Nav rail, conversation list, side panels |
| `--s2` | `#1F1F1D` | `#F0EDE6` | Cards, inputs, own-message blocks |
| `--s3` | `#272725` | `#E7E3DA` | Hover, selected, timer track |
| `--border` | `#2E2E2B` | `#DDD8CC` | Dividers and card outlines only |
| `--border-strong` | `#3D3D39` | `#C9C3B5` | Decorative emphasis only |
| `--control` | `#6C6962` | `#8C867A` | Borders of inputs, toggles, outline buttons, segmented controls |
| `--text` | `#ECE9E2` | `#1B1A17` | Body text |
| `--text-muted` | `#A19D94` | `#5F5B52` | Secondary text, placeholders |
| `--text-faint` | `#89867E` | `#706B61` | Timestamps, system lines |
| `--accent` | `#FF6A3D` | `#D44519` | Fills, rules, focus ring, unread pill |
| `--accent-hover` | `#FF8259` | `#BF3C14` | Primary button hover |
| `--accent-text` | `#FF6A3D` | `#B03915` | Ember used as text or links |
| `--accent-soft` | ember 14% | ember 10% | Reaction chips, voted poll bars, selected tiles |
| `--on-accent` | `#1A0F0A` | `#FFFFFF` | Label on `--accent` |
| `--live` | `#4ADE9A` | `#177B4F` | Online, live activity ring, running timer |
| `--away` | `#F2B84B` | `#B1751E` | Away dot/ring |
| `--danger` | `#F15A57` | `#C53835` | Destructive icons and error text |
| `--offline` | `#6F6C65` | `#8C867A` | Offline dot |
| `--av-1…6` | `#34463F #4A3E36 #3B4056 #4A3C48 #434733 #34454C` | `#CFE0D6 #E6D3C6 #D3D8E8 #E3D0DD #DDE0C8 #CBDDE3` | Avatar backgrounds, initials in `--text` |
| `--scrim` | black 55% | warm black 40% | Modal / sheet backdrop |
| `--elev-float` | `0 8px 24px rgb(0 0 0/.35)` | `0 8px 24px rgb(40 30 10/.12)` | Menus, tooltips, toasts, modals |

Avatar tint is chosen deterministically: `av = (sum of char codes of user id) % 6 + 1`.

### Usage rules (the contrast results depend on these)
1. Ember **text** uses `--accent-text`. Ember fills, rules, rings, pills use `--accent`.
2. Interactive control outlines use `--control`. `--border*` are decoration only.
3. On `--s3` surfaces: no `--text-faint` text (use `--text-muted`); control borders use `--text-faint`; no `--live` text; no `--danger` text in the light theme (icon + `--text` label).
4. `--away` and `--offline` are dots and rings only, always accompanied by a text label somewhere ("Away", "Offline").
5. Colour is never the only signal: dot + label, check icon + "Seen by 3", lock icon + sentence.
6. Accent budget: primary button, unread pill, selected-nav bar, own-message rule, focus ring, link/"Use" text, voted poll option. Nothing else is ember.
7. `--live` means real liveness. Never decorative.
8. Never hard-code hex in components. Use Tailwind token utilities (Section 5).

---

## 3. Typography (FROZEN)

| Role | Font | Notes |
|---|---|---|
| Display: page titles, room title, activity label, panel titles | **Bricolage Grotesque** 600 | `letter-spacing: -0.01em` on display only |
| UI, body, messages | **Instrument Sans** 400 / 500 / 600 | Default |
| Numerals, timestamps, timer, counts, eyebrows | **JetBrains Mono** 400 / 500 | `font-variant-numeric: tabular-nums` |

Scale (rem / line-height): `xs .75/1.1` · `sm .8125/1.25` · `base .9375/1.5` (messages, body, 15px) · `md 1.0625/1.5` · `lg 1.25/1.35` · `xl 1.625/1.25` · `2xl 2/1.15` (page H1; 1.625rem on mobile) · `timer 4.75/1` mono (76px; 3.5rem on mobile). Eyebrow labels: mono 12px uppercase, tracking .04em, `--text-muted`. Max message measure 70ch.

Rules: sizes in `rem` so browser text-size settings work; no fixed-height containers around text; names and previews truncate with ellipsis (`min-w-0` on flex children), never wrap into layout breakage.

### Font loading
- **Development:** Google Fonts with `display=swap` is acceptable.
- **Production requirement (PENDING, owner Chat 08 with Chat 02, not done):** self-host as latin-subset `woff2` (Bricolage 600; Instrument Sans 400/500/600; JetBrains Mono 400/500), same origin, `font-display: swap`, `<link rel="preload" as="font" crossorigin>` for Instrument Sans 400/500, `Cache-Control: public, max-age=31536000, immutable` on hashed files. Define metric-adjusted fallback faces named `"… Fallback"` (the token file already references them) with a tool such as Capsize or Fontaine to avoid layout shift. Release check: the production build makes **no request** to `fonts.googleapis.com` or `fonts.gstatic.com`. All three families are SIL OFL licensed.
- Until fallbacks are defined, the `"… Fallback"` names simply resolve to nothing; this is harmless.

---

## 4. Shape, Spacing, Elevation, Layers (FROZEN values)

- **Spacing:** 4px base (Tailwind default). Usual steps 4, 8, 12, 16, 24, 32. Panels pad 16; list rows 10×16; message groups 14 apart, same-sender messages 2.
- **Radius by role:** `4px` tags, reaction chips, quote strips; `8px` inputs, buttons, tiles, list rows; `12px` cards, modals, own-message blocks, composer; `9999px` only avatars, presence dots, unread pills.
- **Borders over shadows.** 1px `--border` separates panels. `--elev-float` only on floating layers.
- **Icons:** Lucide (`lucide-react`), 1.5px stroke, 14 (inline meta) / 16 / 18 / 20 (nav). Icon-only buttons need `aria-label`; desktop shows a tooltip.
- **Control heights:** button md 36, sm 30 (touch: hit area 44, see Section 6); input 38 (forms 40; mobile 48); composer min 48; nav button 44; list row ≥ 56.
- **Z-index scale:** content 0 · sticky headers 10 · message tools 20 · drawers 30 · scrim 40 · modal/sheet 50 · toast 60 · tooltip 70.

---

## 5. Tailwind v4 Integration (supplied and tested)

Files (copy as-is): `frontend/src/styles/tokens.css`, `frontend/src/styles/index.css`. Import `index.css` once in `main.jsx`. Add `@tailwindcss/vite` to `vite.config.js`. Do not add a `tailwind.config.js`; v4 reads the `@theme` block in CSS. Do not use `dark:` variants; themes switch CSS variables.

**Verified:** the files compile with Tailwind 4.3.5, utilities resolve to the variables, and computed colours in Chromium match the table in Section 2 in both themes (dark accent `rgb(255,106,61)`, light accent text `rgb(176,57,21)`, `color-scheme` switches).

| Need | Utility |
|---|---|
| Surfaces | `bg-canvas bg-s1 bg-s2 bg-s3` |
| Borders | `border-line` (decor) · `border-control` (interactive) · `border-line-strong` |
| Text | `text-ink` · `text-ink-muted` · `text-ink-faint` · `text-accent-text` · `text-danger` |
| Accent | `bg-accent text-on-accent hover:bg-accent-hover` · `bg-accent-soft` |
| State | `bg-live` `bg-away` `bg-offline` `text-live` |
| Avatars | `bg-av-1` … `bg-av-6` |
| Fonts | `font-display` `font-sans` `font-mono` |
| Radius | `rounded-sm` (4) `rounded-md` (8) `rounded-lg` (12) `rounded-full` |
| Elevation | `shadow-float` |
| Motion | `animate-pulse-ring` (2s) · `animate-pulse-ring-slow` (3s) · `animate-typing` · `animate-rise` |
| Breakpoints | default < 768 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 |
| Touch | `hit-44` (44px tap area, no visual change) · `pb-safe` · `pt-safe` |

### `index.html` head (Chat 02 copies exactly; also supplied as `snippets/index-head.html`)
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#121211" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F6F4EF" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<script>
  // Runs before first paint: no theme flash. "system" is the default.
  try {
    var p = localStorage.getItem('pulse-theme');                 // 'system' | 'dark' | 'light'
    var t = (p === 'dark' || p === 'light') ? p : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
</script>
```
`<html lang="en">`. The theme provider updates `data-theme`, `localStorage('pulse-theme')`, and listens to `matchMedia` changes while the choice is "system". After login, the server value `settings.theme` wins and is written back to local storage.

---

## 6. Layout and Responsive Specification

Breakpoints: **mobile < 768 · tablet 768–1023 · laptop 1024–1279 · desktop ≥ 1280 · wide ≥ 1536.** Use `100dvh`, never `100vh`. Minimum supported width 320 px (no horizontal scrolling at 320 px and at 400% zoom).

### 6.1 Desktop ≥ 1280 — four zones (APPROVED, matches mockups at 1440)
```
┌────┬─────────┬───────────────────┬─────────┐
│ 64 │   300   │      flex-1       │   320   │
│nav │ conv    │ conversation/room │ activity│
└────┴─────────┴───────────────────┴─────────┘
```
- Nav rail 64: logo mark 32 at top, five icon buttons (44×44), settings and own avatar at the bottom. Selected = `bg-s3` + 2px ember bar on the left edge. Icons only, tooltip + `aria-label`. Messages icon carries the unread pill.
- Activity panel is collapsible (panel button, state persisted).
- Focus room route: nav 64 · stage 1fr · room chat 360.
- Activity route: nav 64 · cards 1fr · "Your activity" editor 340 (no conversation list).
- **Wide ≥ 1536:** layout widths stay fixed; the main pane grows. Message column capped at `max-w-[880px]` and centred in the pane; own messages align to that column's right edge. Home and activity grids cap at `max-w-[1080px]`.

### 6.2 Laptop 1024–1279
Nav 64 · conversation list 300 · main (≥ 660). The activity panel becomes a **right drawer** (320, `--s1`, `shadow-float`, scrim) opened from the panel button in the conversation header and from the nav "Activity" screen. Same content and styling as the docked panel. Esc, scrim click and a close button dismiss; focus returns to the trigger.

### 6.3 Tablet 768–1023
Nav 64 · conversation list **280** · main (≥ 424). Activity panel is the same drawer as 6.2. Conversation components use `max-w-full` (polls `w-full max-w-[440px]`, own blocks `max-w-[85%]`). Two-column activity/home grids drop to one column when the main pane is under 640 px (container queries, 6.5). Focus room: stage + chat stack: the chat becomes a bottom drawer (55dvh) toggled by a "Room chat" button with an unread dot. Verify at 768 and 820.

### 6.4 Mobile < 768 (redesigned, not shrunk)
**Navigation:** bottom tab bar, 56 px + `env(safe-area-inset-bottom)`, `--s1`, top border `--border`. Five tabs (Home, Messages, Activity, Focus, Friends), icon 22 with an **11 px label** (`text-ink-muted`; selected `text-ink` plus a 2px ember bar on the top edge). Messages tab carries the unread pill. Settings opens from the avatar in the Home/Messages header. The bar is **hidden** on `/messages/:id`, `/focus/:id` and while the keyboard is open.

**Header:** 56 px, `--canvas`, bottom border; title in display 20 px; actions right (44×44 hit areas).

**Routes:**
- `/messages`: full-screen conversation list (rows ≥ 64, same content as the desktop row). Search field sticky below the header. "New conversation" (+) in the header.
- `/messages/:id`: full-screen conversation. Header: back chevron (44), avatar 32, name + status line (tap opens the **Details sheet**: members with presence and activity, mute, leave), canvas icon, search icon. The activity panel does not exist on mobile; its content lives in the Details sheet and the Activity tab.
- Messages: others as approved (avatar 28 on first of group instead of 36, text indent 40), own blocks `max-w-[85%]`, polls and images `w-full`. Date separators sticky.
- **Message actions:** long-press (500 ms) or the `⋯` button opens a **bottom sheet**: quick-reactions row (six emoji, 44 px), Reply, Copy, Edit, Delete (own), with a `--danger` icon and `--text` label for Delete. The hover toolbar does not exist on touch. Keyboard users get the same actions through a `⋯` button that appears on `focus-within`.
- **Composer:** pinned to the bottom, `pb-safe`, min height 48, grows to 5 lines then scrolls, font 16 px (prevents iOS zoom), attach and emoji buttons 44, send 44 (primary). The Spark card collapses into a one-line dismissible chip above the composer. Use `visualViewport` to keep the composer above the keyboard; the message list keeps its bottom anchor.
- `/activity`: one-column cards. The "Your activity" editor is a full-height bottom sheet opened from a "Set activity" button in the header (shows the current activity as a compact chip).
- `/focus`: room list in one column. `/focus/:id`: stage fills the screen; ring **240 px**, digits 56 px; participants wrap (avatars 40); **Room chat** opens a bottom sheet (85dvh) from a button with an unread dot; Leave and Invite in the header. Optional enhancement for Chat 06 to decide: request a Screen Wake Lock while a session is running.
- `/friends`, `/settings`: single-column lists; settings is a list that pushes detail screens.
- **Sheets:** radius 12 on top corners, drag handle 4×36 `--control`, `--scrim` backdrop, max 85dvh, `pb-safe`, focus trapped, Esc and backdrop dismiss, swipe-down dismisses. **Desktop modals become sheets on mobile.**
- **Landscape phones:** header 48; tab bar hidden in conversation; stage layout unchanged.

### 6.5 Component-level responsiveness (container queries)
Use Tailwind container queries (`@container`, `@md:` …) on the main pane so components respond to the pane, not the viewport:
- Activity/Home card grids: 1 column < 480 px pane, 2 columns ≥ 480, 3 columns ≥ 720 (Home "Live now" only; the Activity page stays at most 2).
- Conversation header actions collapse into a `⋯` menu under 480 px.
- Poll card `w-full max-w-[440px]`.

### 6.6 Touch, pointer, safe areas
- `@media (pointer: coarse)`: interactive controls get `hit-44`; spacing between adjacent targets ≥ 8 px; fields 16 px font.
- `@media (hover: hover)`: hover styles and the message hover toolbar apply only here.
- `viewport-fit=cover` plus `pb-safe`/`pt-safe` on fixed bars.
- No custom pull-to-refresh. Prevent body scroll while a sheet or modal is open.

---

## 7. Motion (FROZEN)

Principle: **motion = state change or liveness.** 120 ms hover/press · 180 ms menus, toggles, poll bars · 240 ms panels and sheets. Easing `cubic-bezier(.2,.8,.2,1)`.
- Presence dot: 12px dot with a ring that scales 1 → 2.2 and fades over 2 s (`animate-pulse-ring`). Online only.
- Activity avatar ring: same pulse, 3 s (`animate-pulse-ring-slow`). A stale activity (past its expiry) does not pulse.
- Focus ring: SVG circle r 148, stroke 6, track `--s3`, progress `--live` (running) or `--text-faint` (lobby). `stroke-dashoffset` recomputed every second from the server `endsAt`; no easing. Completion: ring closes, "Session complete · 25 min", no confetti.
- New message: 120 ms fade + 4px rise (`animate-rise`). No bounce.
- Typing: 2px `--live` underline scaling 0.2 → 1 (`animate-typing`).
- Skeletons: static `--s2` blocks fading opacity 1 → .6 over 1.6 s. No shimmer sweep.
- **Reduced motion:** the global rule in `index.css` removes all animation and transition; pulse rings are hidden (`data-pulse` elements); the timer still updates every second but without any animation.
- Ring/dot pulse elements carry `data-pulse` and `aria-hidden="true"`.

---

## 8. Approved Patterns (FROZEN)

### Messages
- **Others:** no bubble. First message of a group: 36px avatar, name (600) + mono time (`--text-faint`); text on canvas, max 70ch.
- **Own:** right-aligned block, `--s2`, 1px `--border`, radius 12, **2px `--accent` left rule** (inside the block, clipped by the radius), padding 10×16, consecutive blocks 4px apart. Time and "Seen by N" in mono under the last block.
- **Reply:** quote strip above the text: `--s3`, 2px `--border-strong` left rule, radius 4, sender in 600 + one truncated line, `--text-muted`. Click jumps to and highlights the original.
- **Reactions:** chips `--s2`, 1px `--border`, radius 4, 24px high, count in mono; own reaction: `--accent-soft` bg, 1px `--accent` border, text `--accent-text`.
- **Receipts:** one check = sent; two checks `--text-muted` = delivered; two checks `--text` + "Seen by N" on the last block = read. Never colour-only.
- **Edited/deleted:** "edited" in mono faint; deleted = italic muted "Message removed".
- **System lines:** centred (room chat: left), mono 12px `--text-faint`.
- **Typing:** "Rohan is typing" in muted 13px with the 2px live underline; up to 3 names, then "several people are typing".
- **Date separators:** sticky, mono, thin rule. A "New messages" pill (accent, count) appears when scrolled up and a message arrives.
- **Hover toolbar (desktop, hover devices):** `--s2`, border-strong, radius 8, `shadow-float`, three 30px icon buttons, top-right of the message.

### Conversation list row
36px avatar + presence dot (2px outline in the row's own surface colour), name 500 (600 when unread), mono time right, one-line preview, unread = ember pill with mono count. Selected = `--s3` + 2px ember left bar; selected time uses `--text-muted`.

### Live Activity card
`--s2`, 1px `--border`, radius 12, padding 16. Head: avatar 42 inside a 54px ring (2px; `--live` pulsing / `--away` / `--control` offline), name 600, presence text. Label in display 19px with a 28px `--s3` type tile (Lucide icon). Meta in mono muted ("updated 2m ago"). Actions: Message (outline) and, only if the person is in a room, **Join focus room** (primary). Locked state: `--canvas` bg, dashed `--control` border, lock icon, sentence "Only friends can see this activity." Editor: 2-column tile picker (selected = `--accent-soft` + 1px `--accent`), "What exactly?" field, segmented control Everyone / Friends / Nobody with a helper sentence, "Clear automatically" select, **Update** (primary) and **Clear**.
Activity types and icons: Studying `book-open`, Coding `code-xml`, Gaming `gamepad-2`, Music `headphones`, Working `briefcase`, Break `coffee`, Available `message-circle`.

### Focus Room
Calm, near-empty. Centre: title (display 30) and meta line (mono), ring 320 with 76px mono digits and "remaining · ends 20:55", status line (live dot + "Session running"), participant row (avatar 48 + name + mono join time, "host" label, dashed Invite circle). Right: room chat (360) with system lines. Lobby: ring in `--text-faint`, digits show the full duration, host sees **Start** (primary), others "Waiting for host".

### Home
Not a stats dashboard: "Continue" (last 3 conversations), "Live now" (activity cards), "Focus rooms you can join". Each section has an empty state with one action.

### Poll, Spark, Canvas
- **Poll:** inline card 440 max: question 600, mono sub-line, options as 36px bars with `--accent-soft` fill animating width (180 ms), mono percent, voted option has a check + 1px `--accent` border.
- **Spark:** dashed `--control` card above the composer, mono "SPARK" tag, text, **Another** (muted) and **Use** (accent text). Never auto-sent.
- **Canvas:** see Section 9.

### Avatars
Image, else initials on `--av-n` (flat). Sizes 24 / 28 / 36 / 42 / 48 / 96. Group = initials of title. Presence dot 12px at bottom-right with a 2px surface-coloured outline.

---

## 9. Specs for Screens Without a Mockup

> These are derived strictly from approved components and tokens. They introduce **no new visual language**, but they were **not drawn or visually reviewed**. Chat 02 builds them; Chat 01 reviews the built result.

**Auth (login / register).** ≥ 1024: two columns. Left: form column `max-w-[360px]`, vertically centred, wordmark (96px) above, H1 "Sign in" / "Create account" (display 2xl), fields 40px, labels above (13px 500), helper/error text below, primary button full width 40px, secondary text link ("Create an account" / "Sign in") in `--accent-text`. Right: `--s1` panel with a single large static heartbeat line (SVG, `--accent` 2px stroke, the logo's shape stretched across the panel) and the tagline "Conversations that feel alive." in display 30. No people, no stats, no gradients. < 1024: single column, panel hidden, wordmark centred above the form. Rules: `autocomplete` (`username`, `email`, `current-password`, `new-password`), password show/hide button (44 hit, `aria-pressed`), errors under the field with `aria-describedby`, an error summary `role="alert"` on submit failure, error text in `--danger` on `--canvas`/`--s1` only, submit shows a loading state without changing width, Enter submits. Password rules shown as a helper line ("8 to 72 characters"), not a strength meter.

**App boot splash.** `--canvas`, mark 48 centred, no animation. Shown until the refresh call resolves.

**Friends.** Tabs: Friends · Requests (count pill) · Find people. Search field (same as conversation search). `UserRow` min 56: avatar 36 + presence, name 500, `@username` mono muted, actions right: Message (ghost sm), `⋯` menu (Unfriend, Block). Request row: **Accept** (primary sm) and **Decline** (outline sm). Find people: results with **Add** (outline sm) → "Requested" (muted text, disabled). Empty: "No friends yet. Search by username to send a request."

**Settings.** ≥ 1024: sub-list (Profile, Appearance, Privacy, Account; 200px) + content `max-w-[560px]`. Mobile: list → detail screens. Rows: label (500) + helper (muted 13px) left, control right, 1px `--border` dividers. Profile: avatar 96 + Change, display name, username (read-only), bio (160 counter in mono). Appearance: Theme segmented (System / Dark / Light). Privacy: "Who can see my activity" segmented (Everyone / Friends / Nobody), toggles "Show when I'm online" and "Show read receipts". Account: Change password, **Sign out** (outline button; the confirm step uses a modal). Toggle: 40×24, track `--control` off / `--accent` on, thumb 18, `role="switch"`.

**New conversation (modal / mobile sheet).** Tabs Direct · Group. Search field; user list with 56px rows (Direct: click row; Group: checkbox rows). Selected members as chips (`--s2`, 1px `--border`, radius 4, remove button 24 with 44 hit area). Group name input (max 60). Footer: **Create** (primary), **Cancel** (ghost). Only friends are listed. Width 480 (desktop).

**Create poll (modal / sheet).** Question input (200, counter), 2–8 option inputs with remove buttons and "Add option", toggles "Allow multiple answers" and "Anonymous", "Closes in" select (No limit / 10 min / 1 h / 24 h). Primary **Create poll**. Validation inline.

**Shared canvas.** Pane `--s2`, 1px `--border`, radius 12. Toolbar (bottom-centre on mobile, top-left on desktop): five tools (pen, eraser, line, rect, ellipse) as 36px icon buttons (selected = `--s3` + 2px ember underline), six muted ink swatches (no neon; 24px circles with a `--control` ring when selected), size slider, Clear (outline, confirm). Collaborator cursors: 12px dot in their `--av-n`, name tag `--s3` / `--text`, radius 4. Touch: one finger draws, two fingers pan/zoom. The canvas is opened from the conversation header icon and is not shown in the message flow.

**Attachments.** Composer preview row above the input: 56px cards (`--s2`, border, radius 12), 48px thumbnail or file icon, truncated name, size in mono, remove button, 2px `--accent` upload progress. In messages: images max 320×240, radius 8, click opens a viewer (scrim 90%, Esc closes, arrow keys, focus trapped, `alt` = file name); files render as a 56px card (icon, name, mono size, Download). Types and size limits come from `API_CONTRACT.md`.

**Menus, tooltips, toasts.**
- Menu: `--s2`, 1px `--border-strong`, radius 8, `shadow-float`, items 36 (44 touch), hover `--s3`, separators `--border`, destructive item = `--danger` icon + `--text` label. Arrow-key navigation, typeahead, Esc closes and restores focus.
- Tooltip: `--s3`, `--text`, 12px, radius 4, 400 ms delay on hover, immediate on keyboard focus, never the only place an instruction lives.
- Toast: `--s2`, 1px `--border-strong`, radius 12, `shadow-float`, icon + one line + optional action in `--accent-text`; 5 s auto-dismiss (pauses on hover/focus); bottom-left on desktop, bottom-centre above the tab bar on mobile; `role="status"`, errors `role="alert"`; max 3 stacked.

**State components.**
- `EmptyState`: 40px `--s3` tile (radius 8) with a 20px icon, heading 15/600, one muted sentence, one action. Copy examples: "No conversations yet. Find a friend to start one." · "Nobody is live right now." · "No focus rooms to join. Create one."
- `ErrorState`: what failed + **Retry**; no stack traces.
- `ConnectionBanner`: 32px strip under the header, `--s2`, bottom border. Reconnecting: `--away` dot + "Reconnecting…". Offline: warning icon in `--danger` + "Offline. Messages will send when you're back". `aria-live="polite"`. The composer stays usable (messages queue).
- `Skeleton`: shapes of the final layout, no spinner except boot.
- 404 uses `EmptyState`.

---

## 10. Component Inventory

`components/ui`: Button (primary, secondary/outline, ghost, danger-outline; sm/md; loading), IconButton, Input, Textarea, Select, Toggle, SegmentedControl, Avatar, PresenceDot, CountPill, Chip, Tooltip, Menu, Modal, BottomSheet, Drawer, Tabs, Skeleton, Toast, Spinner, Divider, Kbd, VisuallyHidden.
`components/common`: EmptyState, ErrorState, ConnectionBanner, ErrorBoundary, UserRow, SearchField, SkipLink.
Feature-level (Chat 06): ActivityCard, ActivityPicker, FocusRing, RoomCard, ParticipantStack, PollCard, SparkCard, CanvasBoard.

Every component implements: default, hover (hover devices only), focus-visible, active, disabled (50% opacity, no pointer events, `aria-disabled` where it must stay focusable), loading/error where relevant.
**Button:** md 36 / sm 30, radius 8, 14px/500, primary `bg-accent text-on-accent hover:bg-accent-hover` (no gradient, no shadow); outline = 1px `--control` border; ghost = `--text-muted`, hover `--s3`. Loading keeps width and shows a 16px spinner with `aria-busy`.
**Focus ring (all):** `outline: 2px solid var(--accent); outline-offset: 2px` (0 on text fields, which sit on `--s2`). Provided globally in `index.css`. Never `outline: none` without a replacement.

---

## 11. Accessibility (WCAG 2.2 AA)

**Structure**
- Landmarks: `nav` (rail / tab bar, `aria-label="Primary"`), `aside` (conversations, activity), `main` (one per page), `header` inside panes. The first focusable element is a **Skip to main content** link.
- Route change: move focus to the page `h1` (`tabIndex=-1`), update `document.title` ("Thesis crew · Pulse"). One `h1` per route.
- Modals, sheets, drawers: `role="dialog"` `aria-modal="true"` with a label, focus trap, Esc closes, focus returns to the trigger, background `inert`.

**Names and status**
- Icon-only buttons: `aria-label`. Avatars: `alt=""` when the name is adjacent; otherwise `aria-label="Meera Rao, online"`. Presence dot: visually hidden text ("online", "away", "offline").
- Unread pills: `aria-label="3 unread messages"`. Toggles: `role="switch"` + `aria-checked`. Segmented controls: `role="radiogroup"`.
- Selected nav item: `aria-current="page"`; selected conversation: `aria-current="true"`.

**Live regions**
- Message list: `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`; own messages are not re-announced; a scrolled-up user hears nothing extra besides the "New messages" button.
- Typing indicator: `aria-live="polite"`, throttled to one announcement per person per 10 s.
- Toasts: `role="status"` / `role="alert"`. ConnectionBanner: polite.
- **Focus timer:** the visible digits are `role="timer"` with `aria-live="off"` (never announce every second). A visually hidden polite region announces: session started, "5 minutes left", "1 minute left", "Session complete". The SVG ring is `aria-hidden`.

**Keyboard**
- Everything operable by keyboard. `/` focuses search, `Esc` closes layers, `Enter` sends, `Shift+Enter` new line, `↑` in an empty composer edits the last own message (optional), `Ctrl/Cmd+K` quick switcher (later). Arrow keys in menus, tabs, segmented controls and the emoji picker. No keyboard traps (the canvas has a documented Esc to leave).
- Message actions are available through the `⋯` button on `focus-within`.

**Visual**
- Contrast: Section 13. Focus visible on every interactive element, ≥ 3:1.
- Target size ≥ 24×24 everywhere (SC 2.5.8); 44×44 on touch via `hit-44`.
- Reflow at 320 px and 400% zoom; text resize to 200% without loss; `rem` sizes. Text-spacing overrides must not clip (no fixed heights).
- `prefers-reduced-motion` honoured (Section 7). `forced-colors: active`: the own-message rule and pulse rings use system `Highlight`, borders stay visible (rules in `index.css`).
- Colour is never the only signal (Section 2 rule 5).
- Language: `lang="en"`; user-generated text is rendered as text, never HTML.

**Testing (Chat 07):** axe on every route in both themes, keyboard-only walkthrough, NVDA or VoiceOver pass on login, send message, reaction, activity update and focus room, 200% / 400% zoom, 320 px width, reduced motion, forced colors (Windows High Contrast).

---

## 12. Logo and Icons (APPROVED)

- **Wordmark:** lowercase `pulse`, monoline geometric, drawn as vector paths (no font). The heartbeat in the `u` uses `--accent` (deeper `#D44519` on light). Ink = `--text`. Clear space = one stem width; minimum width 64 px, below that use the mark. No gradient, glow, outline or animation inside the logo.
- **Mark:** the `u` with its heartbeat on an ember rounded square. Used in the nav rail (32 px), splash (48), favicon.
- **Files:** `logo/pulse-wordmark-{dark,light}.svg`, `pulse-mark.svg`, `pulse-mark-light.svg` and `*-on-canvas` variants. In-app, inline the SVG so it can use `currentColor` for ink and `var(--accent)` for the heartbeat.
- **Icon set (new in v1.2):** `public/favicon.svg` and `favicon.ico` (16/32/48, simplified heavier stroke), `apple-touch-icon.png` (180, full-bleed square), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (safe zone checked in a circle crop), `site.webmanifest`. **Known limit:** the heartbeat is only suggested at 16 px; it reads as a `u` with a spike. Acceptable for a favicon; do not scale the 16 px file up.

---

## 13. Contrast (WCAG 2.2 AA): summary; full tables in `CONTRAST_REPORT.md`

- 44 pairs per theme were measured against v1.0 (9 failing in dark, 21 in light); the v1.1 values fix all of them. v1.2 adds 9 extra state pairs per theme: 8 pass in dark and 7 in light. The failures are in Section 2 rule 3: **control border on `--s3`** (2.73 dark, 2.82 light) and **`--live` text on `--s3`** (light 4.12). They are handled by rules, not colours, so the approved palette is untouched.
- Three earlier rule-handled pairs remain: faint text on `--s3` (both themes) and danger text on `--s3` (light).
- Two light-theme pairs pass by about 0.002 (white label on accent 4.50; danger text on `--s2` 4.50). Chat 07 re-measures them in the built app. If they slip, use `--accent` `#CB4217` and `--danger` `#BF3431` (alternatives in the report).
- **Not covered:** the built app, disabled states, text over images, tooltip/toast shadows, link text inside messages, colour-vision simulation.

---

## 14. Handoff

### To Chat 02 (Frontend), order of work
1. Copy `frontend/src/styles/tokens.css` and `index.css`; install `tailwindcss`, `@tailwindcss/vite`, `lucide-react`; add the plugin; paste the `index.html` head (Section 5); copy the `public/` icons and `src/assets/logo/*`.
2. Theme provider (system / dark / light, persisted, syncs with the server setting).
3. `components/ui` and `components/common` per Section 10, with a dev-only `/dev/ui` route showing every state in both themes.
4. `AppShell` for ≥ 1280, then 1024–1279 (drawer), 768–1023, and `MobileShell` (<768). Build all breakpoints now; do not leave mobile for later.
5. Feature screens against the mockups in `mockups/`. Compare each built screen to its PNG at 1440 × 900 in both themes before asking for review.
6. Screens in Section 9 (no mockups).

**Do not:** add colours, gradients, fonts or radii; use `dark:` variants; hard-code hex; use emoji as UI icons; animate anything outside Section 7; use `100vh`.

### To Chat 06
FocusRing, ActivityCard, PollCard, SparkCard and CanvasBoard follow Sections 8 and 9. Timer values come only from the server `endsAt` (offset-corrected); the visual updates every second; ARIA as in Section 11.

### To Chat 07
Section 11 test list; Section 13 re-measurement; the slop table (Section 1); both themes at 360, 768, 1024, 1280, 1440; touch targets; reduced motion; forced colors.

### To Chat 08
Font self-hosting (Section 3, PENDING), caching headers for icons and fonts, `site.webmanifest` served as `application/manifest+json`, a CSP that allows self-hosted fonts only once Google Fonts is removed.

### Design review of the built app (Chat 01)
Pass criteria per screen: layout matches the PNG at 1440 × 900; tokens only; both themes; focus ring visible; no layout shift on font load; no horizontal scroll at 320; motion only where Section 7 allows.

---

## 15. Deliverables and Status

| Item | Status |
|---|---|
| Palette, type, spacing, radius, layout, patterns (frozen) | **Done and owner-approved** |
| Logo (wordmark, mark) | **Done and owner-approved** |
| Mockups: shell, conversation, Live Activity, Focus Room (dark + light) | **Done and owner-approved** |
| Contrast measurement on tokens | **Done** (rules cover the residual pairs) |
| `tokens.css`, `index.css` | **Done, test-compiled**; wired by Chat 02 |
| Mobile mockups: Conversation, Live Activity, Focus Room (dark + light) | **Done and owner-approved 2026-11-16** (`mockups/mobile/`) |
| Responsive spec: mobile | Specified, mocked and approved; keyboard in the mockup is a generic placeholder, real keyboard behaviour must be verified in the built app; not tested on devices |
| Responsive spec: tablet, laptop, wide | **Specification only; no mockups; not verified visually** |
| Specs for unmocked screens (Section 9) | **Done as specification. Not drawn or reviewed** |
| Accessibility spec | **Done as specification. Not tested on a built app** |
| Favicon / app icon set | **Done** (simplified mark) |
| Font self-hosting | **PENDING** (Chat 08), required before production |
| Contrast and accessibility testing on the built app | **PENDING** (Chat 07) |
| Frontend implementation | **Not started** (Chat 02) |
| Design review of built screens | **PENDING** (Chat 01, after Chat 02 builds) |

---

## IMPLEMENTATION REPORT (v1.2)
1. Task: Finalize Design System v1.2 for frontend implementation without changing the approved visuals
2. Role: Chat 01 UI/UX Designer
3. Files inspected: `DESIGN_SYSTEM.md` v1.1, `CONTRAST_REPORT.md`, `API_CONTRACT.md`, `ARCHITECTURE.md`, mockup sources
4. Files created: `frontend/src/styles/tokens.css`, `frontend/src/styles/index.css`, `frontend/public/*` icon set + manifest, `snippets/index-head.html`; contrast addendum in `CONTRAST_REPORT.md`
5. Files modified: `DESIGN_SYSTEM.md` (v1.1 to v1.2), `IMPLEMENTATION_STATUS.md`
6. Features implemented: none (design specification and style assets only)
7. API changes: none
8. WebSocket event changes: none
9. Database changes: none
10. Dependencies added (for Chat 02): `tailwindcss`, `@tailwindcss/vite`, `lucide-react`
11. Tests executed: Tailwind 4.3.5 compile of the style files; computed-style check in Chromium for both themes; contrast calculation for 9 additional pairs per theme; icon rendering at 16/32/180/512 and maskable crop
12. Test results: style files compile and resolve; one circular variable bug found and fixed; additional gaps found and handled by rules (Section 13); icons render correctly; the 16 px favicon is legible but coarse. NOT tested: responsive layouts (specified only), unmocked screens, screen readers, any real browser besides Chromium
13. Known issues: tablet/mobile and the Section 9 screens are specified but not visually verified; two light-theme contrast pairs are limit cases; fonts still load from Google Fonts in development
14. Pending work: font self-hosting (Chat 08); built-app contrast and accessibility testing (Chat 07); design review of Chat 02's build (Chat 01); tablet/laptop and unmocked screens remain spec-only and unverified visually (mobile mockups approved in v1.3)
15. Integration requirements: Chat 02 wires the styles and builds per Section 14; Chat 08 owns fonts and caching; Chat 07 runs the Section 11 and 13 checks
