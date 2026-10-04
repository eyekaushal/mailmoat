# mailmoat design system

Written in R01 from `PLAN.md §13.2` and the chosen logo (`docs/design/logo/option-d1-night-watch.svg`).
Every screen built in R01–R07 follows this file. Change the rules here first, then the code.

The bar is Superhuman (`docs/reference_docs/reference_screenshots/`): light, quiet, dense, one
accent, tinted labels, icons with tooltips, keyboard hints along the bottom. Security is a calm
layer under the mail, never the loudest thing on the screen.

## 1. Logo and derived marks

"Night watch": a rounded night-sky badge, a cream lighthouse with a lit face and a shadow face,
two red bands, an amber lantern and one beam over dark water. The lighthouse is the moat's
keeper: it watches, it warns, it never shouts.

| Asset | File | Use |
|---|---|---|
| Logo | `docs/design/logo/option-d1-night-watch.svg` | README, website, app icon source (64 px grid) |
| App icon / favicon | `web/public/favicon.svg` | Browser tab, Dock (v1.1). 32 px grid: badge, tower, two bands, lantern, beam, sea. No stars, no rock, no glow, so it stays readable at 16 px |
| Rail mark | `web/public/brand/mark.svg` | Top of the icon rail at 28 px. The logo with the stars and rock removed |
| Wordmark | `web/public/brand/wordmark.svg` | Setup wizard header, README. Mark + "mailmoat" in the system face, 500 weight, ink colour, lowercase, letter-spacing −0.01 em |

Clear space around any mark is half its height. Never recolour the marks; on the night-sky badge
the cream and amber are the brand, not the navy.

### Logo palette

| Token | Value | From |
|---|---|---|
| `navy-900` | `#0b1430` | sky, bottom |
| `navy-700` | `#1c2f57` | sky, top |
| `navy-500` | `#243655` | gallery, cap |
| `sea-700` | `#102c4c` | water, bottom |
| `sea-500` | `#1f4f7a` | water, top |
| `sea-200` | `#8ec5e8` | wave highlight |
| `cream` | `#f4ead3` | lit tower face |
| `cream-shade` | `#cdbf9f` | shadow tower face |
| `amber` | `#ffcf6b` | lantern, beam |
| `amber-glow` | `#ffe29a` | lantern glow |
| `red` | `#c8463a` | bands |

The UI accent is derived from the sea: `accent = #2a4a7f` (between `sea-500` and `navy-700`),
used for the selected rail item, the primary button, focus rings and links. The red band colour
is the risk red. Amber is reserved for the unread dot and the "To reply" label. The former purple
accent (`#4f46e5`) is gone everywhere.

## 2. Colour tokens

Defined once in `web/src/styles.css` as CSS variables and exposed to Tailwind through
`@theme inline`. Light only: there is no dark theme and no `prefers-color-scheme` handling.

### Canvas, panels, ink

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f3f1ec` | Page background when the wallpaper is "none"; also the colour the wallpaper fades to |
| `panel` | `rgba(255,255,255,0.85)` | Main and right panels over the wallpaper, with `backdrop-filter: blur(24px) saturate(1.15)` |
| `panel-solid` | `#ffffff` | Popovers, dialogs, menus, tooltips (never translucent: text must stay crisp) |
| `rail` | `rgba(255,255,255,0.55)` | The icon rail, blurred like a panel |
| `surface-2` | `rgba(29,29,31,0.04)` | Hover rows, quiet chips, input backgrounds |
| `surface-3` | `rgba(29,29,31,0.07)` | Pressed rows, the selected tab underline, read bars |
| `line` | `rgba(29,29,31,0.07)` | Hairlines, only where spacing cannot separate |
| `line-strong` | `rgba(29,29,31,0.14)` | Input borders, checkbox and switch edges |
| `ink` | `#1d1d1f` | Body text, titles |
| `secondary` | `#6e6e73` | Snippets, metadata, hints, inactive tabs |
| `tertiary` | `#a1a1a6` | Timestamps, placeholders, dividers in text |
| `accent` | `#2a4a7f` | Selected state, primary button, links, focus ring |
| `accent-soft` | `rgba(42,74,127,0.10)` | Selected rail item and row background |
| `accent-fg` | `#ffffff` | Text on `accent` |
| `unread` | `#e0a83c` | Unread dot (amber), also the dot in the Google "unverified" guide |

### Status (used sparingly; always with an icon or a word)

| Token | Value | Soft | Use |
|---|---|---|---|
| `danger` | `#c8463a` | `#fbe9e6` | The red dot in the list, the Dangerous and Suspicious tags on an opened email, Block buttons, the Delete-all zone |
| `safe` | `#2f7d5b` | `#e3f3ea` | Connection dots, "Connected ✓", test-key success |
| `warn` | `#9a6400` | `#fff3d6` | Pending approvals count, "first sync pending" |
| `neutral` | `#6e6e73` | `rgba(29,29,31,0.06)` | Policy ALLOW/ASK chips, counts |

Risk red appears only where §13 allows: the list dot, the opened-email tag, Security Center.
Never a red banner, never a red card, never two risk labels on one item. The word "Safe" is
never shown as a label.

### Label palette (one hue per category, tinted background with darker text)

| Category | Background | Text | Icon (Phosphor) |
|---|---|---|---|
| To reply | `#fff1cc` | `#8a5a00` | `ArrowBendUpLeft` |
| Awaiting | `#fde8d2` | `#8f4a12` | `HourglassMedium` |
| FYI | `#e3eefb` | `#1f4f7a` | `Info` |
| Newsletter | `#ece7fb` | `#4f3fa3` | `Newspaper` |
| Marketing | `#fbe3ec` | `#9a2f5a` | `Megaphone` |
| Calendar | `#dff3e9` | `#1f6b4a` | `CalendarBlank` |
| Receipt | `#edf1d8` | `#55681c` | `Receipt` |
| Notification | `#e8ecf1` | `#4a5568` | `Bell` |
| Cold | `#e3f1f5` | `#2b6577` | `Snowflake` |
| Suspicious | `#fbe9e6` | `#a0362c` | `Warning` (opened email only) |
| Dangerous | `#fbe9e6` | `#a0362c` | `WarningOctagon` (opened email only) |

Tags are 11 px, 500 weight, lowercase like Superhuman's `pitch`/`news`, 2 px 6 px padding,
radius 4, no border, no icon inside the tag in the list (the icon belongs to the tab).

### Action chips (Assistant rules; R05)

Archive `#e8ecf1`/`#4a5568` · Label `#e3eefb`/`#1f4f7a` · Draft `#fff1cc`/`#8a5a00` ·
Mark read `#edf1d8`/`#55681c` · Trust `#dff3e9`/`#1f6b4a` · Block `#fbe3ec`/`#9a2f5a`.
The rule actions wear them as: `label` → Label, `archive` → Archive, `draft_reply` → Draft,
`alert` → Block (the security tint), `log` → neutral (`surface-3`, `secondary` text). A chip the
user may toggle is a button with `aria-pressed`; unselected it is quiet (`surface-2`, `secondary`).

### Avatars

Initials on a soft colour: background `hsl(h 55% 90%)`, text `hsl(h 45% 32%)`, where `h` is a
stable hash of the address (0–359). Sizes 24 / 32 / 40 px; the list uses 32 px, the opened
message and the sender card 40 px, the account footer 28 px. One pixel inner hairline
(`line`), fully round, initials at 11 / 12 / 14 px, 500 weight, one letter for a bare address.
The user's own avatar may be the Google profile photo (fetched once by the server; R02).

## 3. Type

```
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue",
             "Inter Variable", Inter, sans-serif;
```

SF Pro is the Apple system face and is not bundled. Inter Variable (latin, weight axis) is
bundled from `@fontsource-variable/inter` so non-Apple machines get the same rhythm; it is
served by the local server, so the CSP stays `font-src 'self'`.

| Step | Size / line | Weight | Use |
|---|---|---|---|
| `xs` | 11 / 14 | 500 | Tags, key hints, counts, tooltips |
| `sm` | 12 / 16 | 400 | Metadata, timestamps, table headers (uppercase never) |
| `base` | 13 / 18 | 400 | Lists, tables, menus, buttons, inputs |
| `md` | 15 / 22 | 400 | Reading view body, settings labels, Ask AI answers |
| `lg` | 17 / 24 | 500 | Section titles, dialog titles |
| `xl` | 20 / 26 | 500 | Page titles ("Important 13"), the opened email subject |
| `2xl` | 24 / 30 | 500 | Setup wizard and Ask AI prompt ("What can I help you with today?") |

Weight 400 for text, 500 for anything that must stand out (sender, subject, titles, selected
tab), 600 nowhere. Letter-spacing −0.01 em at 17 px and above. Numbers in lists use
`font-variant-numeric: tabular-nums`. Ellipsis, never wrapping, in list rows.

## 4. Spacing, shape, elevation

- **Spacing** on a 4 px grid: 4, 8, 12, 16, 20, 24, 32, 48. Rows are 40 px tall, 16 px side
  padding; table cells 12 px; panels 20 px; page gutter 8 px between panels and the window.
- **Radii:** 6 (inputs, chips, key hints, small buttons), 10 (buttons, menu items, rail items,
  cards), 14 (panels, dialogs). Avatars and dots are round.
- **Shadows**, soft and rare:
  - `shadow-panel`: `0 1px 2px rgba(20,24,40,.05), 0 8px 24px rgba(20,24,40,.05)` for panels
    over the wallpaper.
  - `shadow-pop`: `0 2px 6px rgba(20,24,40,.08), 0 12px 32px rgba(20,24,40,.14)` for menus,
    tooltips, dialogs.
  - Nothing else casts a shadow. No borders where spacing can separate.
- **Hairlines** only between a list and its header, between table rows, under the rail mark.

## 5. Motion

`--ease: cubic-bezier(.2, .7, .3, 1)`. Hover and press 120 ms; panels, menus and tooltips
160 ms (fade + 4 px slide from the trigger side); nothing bounces, nothing is longer than
180 ms. `prefers-reduced-motion: reduce` removes every transition.

## 6. States

| State | Treatment |
|---|---|
| Hover | background `surface-2`; icon buttons also lift to `ink` from `secondary` |
| Selected row | background `accent-soft`, 2 px `accent` bar on the left edge |
| Active rail item | background `accent-soft`, icon `accent`, Phosphor `fill` weight |
| Focus (keyboard) | 2 px `accent` ring, 2 px offset, radius follows the control; never removed |
| Disabled | opacity 0.45, `cursor: not-allowed`, tooltip says why when it is a lock (security rules) |
| Loading | `CircleNotch` spinning at 16 px beside the text; never a full-screen spinner inside a panel |
| Empty | `EmptyState`: a 20 px icon on a `surface-2` disc, a 15 px title, one line of `secondary` text, optional quiet action |
| Error | one line of `danger` text under the control that failed; never a toast |

## 7. Layout

```
┌──┬────────────────────────────────────────────┬──────────────┐
│  │ panel: title · tabs · search          icons │ panel: right │
│r │ ─────────────────────────────────────────── │ Today /      │
│a │ rows…                                       │ sender card  │
│i │                                             │              │
│l │                                             │              │
│  │                                             │              │
├──┴────────────────────────────────────────────┴──────────────┤
│   Hit / to search · e to archive · r to reply · ? for help  × │
└──────────────────────────────────────────────────────────────┘
```

- **Wallpaper** fills the window (`Wallpaper`); choices: `tide` (Monet, *Low Tide at Pourville*,
  default), `valley` (Monet, *The Valley of the Nervia*), `gradient` (cream to sky), `none`
  (`canvas`). Bundled at 1800 px, public domain. The painting is tone, not focus: panels are
  translucent and blur it; it shows in the 8 px gutters and through the rail.
- **Rail** (`Rail`): 56 px, mark at the top, seven icon-only items with tooltips (Inbox, Ask AI,
  Assistant, Approvals, Unsubscribe, Security, Settings), the approvals count as a small
  bubble, the account footer at the bottom (avatar; menu shows avatar · name · email · chevron,
  connection status, Settings, keyboard hints).
- **Main column**: one panel, min 640 px, title row 56 px, then the screen.
- **Right panel**: 300 px, Today when nothing is open, the sender card when an email is open
  (R03/R04). Hidden under 1100 px.
- **Keyboard-hint bar** (`KeyHintBar`): 36 px along the bottom, dismissible (×), restored from
  the account menu. Hints: `/` search, `e` archive, `r` reply, `j` `k` move, `?` help.

## 8. Components (`web/src/ui/`, one file per component)

Radix primitives (the `radix-ui` package) styled with Tailwind; Phosphor icons
(`@phosphor-icons/react`), `regular` weight at 16 or 20 px, `fill` only for the active rail item.

| Component | Built on | Notes |
|---|---|---|
| `Tooltip` | Radix Tooltip | 300 ms delay, `panel-solid`, 11 px, optional key hint; `TooltipProvider` wraps the app |
| `Switch` | Radix Switch | 28 × 16, `accent` when on, `line-strong` when off; a lock icon and `disabled` for security rules |
| `Checkbox` | Radix Checkbox | 16 px, radius 4, `accent` when checked, `Check` icon at 12 px |
| `DropdownMenu` | Radix DropdownMenu | `panel-solid`, radius 10, items 13 px with a 16 px icon, `shadow-pop` |
| `Dialog` | Radix Dialog | centred, 440 px, radius 14, overlay `rgba(29,29,31,0.25)`, title `lg`, actions right-aligned, Cancel as text |
| `Tabs` | Radix Tabs | quiet text + count + icon; selected = `ink` 500 weight, others `secondary` (R03) |
| `Avatar` | own | initials on a soft colour, sizes 24 / 32 / 40, optional photo |
| `Tag` | own | the label palette above (R03) |
| `Row` | own | 40 px list row with hover actions (R03) |
| `Panel` | own | translucent blurred panel, radius 14, `shadow-panel` |
| `KeyHint` | own | `<kbd>` chip: `panel-solid`, hairline, radius 4, 11 px, 20 px tall |
| `SearchLine` | own | the `/` search line at the top of the list (R03) |
| `EmptyState` | own | see States |

Rules for every component:

- Every icon-only control has an `aria-label` and a `Tooltip` with the same words, plus the key
  hint when one exists.
- AI output is plain text, labelled where it appears ("AI summary", inside the opened email or
  in Ask AI), never in a list row.
- No colour carries meaning on its own: the red dot has a tooltip, the opened email shows the
  word, the unread dot has a tooltip.
- Buttons: one primary per view (`accent`), the rest quiet (`surface-2` on hover, `ink` text);
  destructive buttons are quiet with `danger` text, never a red block. Reject and Cancel are
  text buttons.
- Inputs: 32 px tall, `line-strong` border, radius 6, `accent` ring on focus, placeholder in
  `tertiary`.
