# Blaze: Hourtrail design system

The contract for every screen. The direction is decided; implementation applies it and does not reopen it. A gap (a state or component not described here) is decided by the orchestrator, written here first, then briefed. Screens and flows are in [UI_UX_DECISIONS.md](UI_UX_DECISIONS.md).

## Concept

The name gives the idea. A trail is marked with blazes, upright rectangles of paint. In Hourtrail **each activity type is a blaze colour, each session is a blaze on the day's trail, and the day is the trail**. Three terms are used below:

- **Blaze**: an upright rounded rectangle in an activity type's colour.
- **Trail**: the line blazes sit on, vertical in History and a horizontal 24-hour ribbon on Home.
- **Wash**: a faint tint of the type colour, used as the background of the running-session panel.

Five rules keep it consistent:

1. **Colour means activity type and nothing else.** Chrome is ink on paper. Buttons, links, selection and focus are ink. The only other colours are danger and caution, used for text and icons and always with words.
2. **One face with character, for time.** National Park (the open-source typeface cut from US park trail signs) sets timers, figures and titles. Everything else is the system font, which pairs cleanly with Chinese.
3. **Lists, not cards.** Content sits directly on paper, separated by hairlines. Only overlays (sheets, menus, toasts) get a raised surface, and only the running panel gets a wash.
4. **One bold thing per screen**: the running panel on Home, the trail in History, the headline figure in Reports. Everything around it stays quiet.
5. **Text never sits on a blaze colour.** A blaze is a mark beside text, so contrast never depends on the type colour.

Avoid, because they would make it look generic: uppercase or letter-spaced labels, middle-dot separators, arrows appended to buttons, gradient fills, a shadow under static content, one radius on everything, and a card around every group.

## Colour tokens

All tokens are CSS custom properties prefixed `--ht-`, defined once in `apps/web/src/lib/styles/tokens.css` for light, and overridden under `@media (prefers-color-scheme: dark)` and `[data-theme]`. Components use tokens only; a stylelint rule rejects raw colours and off-scale lengths outside that file. Contrast ratios below were computed against paper and surface; keep the check as a unit test over the token file.

| Token         | Light     | Dark      | Use                                            |
| ------------- | --------- | --------- | ---------------------------------------------- |
| `paper`       | `#F1F4F0` | `#111614` | Page background (pale map paper, forest night) |
| `surface`     | `#FFFFFF` | `#1A211E` | Sheets, menus, toasts, inputs                  |
| `sunken`      | `#E4E9E3` | `#0B0F0D` | Ribbon track, pressed state                    |
| `ink`         | `#17211D` | `#E8EDE9` | Text, primary buttons (≥ 13:1)                 |
| `ink-2`       | `#4C5953` | `#A9B5AF` | Secondary text (≥ 6:1)                         |
| `ink-3`       | `#66726C` | `#86938C` | Tertiary text, gap rows (≥ 4.5:1 on paper)     |
| `line`        | `#D5DBD5` | `#2B3531` | Hairlines, the trail                           |
| `line-strong` | `#7A8780` | `#66746D` | Control borders (≥ 3:1)                        |
| `danger`      | `#B42318` | `#FF8A7A` | Destructive text and icons                     |
| `caution`     | `#8A5300` | `#F2B84B` | Review and clock cautions                      |
| `brand`       | `#1E3A31` | same      | App icon and splash only                       |

Blaze palette (the `color` of an activity type). `mark` paints blazes, trail segments and chart bars (≥ 3.4:1 on paper as a graphic); `text` is for the rare coloured word in light mode (≥ 5.5:1); in dark mode the mark doubles as text.

| Key       | Light mark | Light text | Dark mark |
| --------- | ---------- | ---------- | --------- |
| `lake`    | `#2563C9`  | `#1D55B3`  | `#6CA0F5` |
| `saffron` | `#B87400`  | `#8A5600`  | `#F0B43C` |
| `fern`    | `#2E8B57`  | `#1F6E43`  | `#5FC08A` |
| `rowan`   | `#C8402F`  | `#AD3122`  | `#F0796A` |
| `heather` | `#7A4FBF`  | `#6A3FB0`  | `#AE8BEA` |
| `spruce`  | `#0F7F86`  | `#0B6A70`  | `#45BAC0` |
| `rose`    | `#C4477F`  | `#A93669`  | `#EE82B0` |
| `lichen`  | `#6F7D12`  | `#56620B`  | `#B4C254` |
| `slate`   | `#5B6B82`  | `#4C5B70`  | `#9AAAC2` |
| `bark`    | `#8A5A3C`  | `#774B30`  | `#C99675` |

Wash is `color-mix(in srgb, var(--blaze) 12%, var(--ht-surface))` in light and 16% in dark; ink on any wash stays above 9.8:1. A component receives its type colour by setting `--blaze` on its root. A type is always named in text next to its blaze, so colour is never the only signal. Charts use the same mark colours: a type keeps its colour everywhere, and a work item's bar takes its default type's colour.

## Typography

- `--ht-font-display`: `"National Park", ui-rounded, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`. Self-host the variable font (weights 200–800, OFL 1.1; try `@fontsource-variable/national-park`, otherwise the files from the project's repository with the licence), Latin subset, `font-display: swap`, precached.
- `--ht-font-text`: `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`.
- Display roles use weight 600 so Chinese falling back to PingFang Semibold matches the Latin.
- Timers must not jitter. The font's tabular figures are unconfirmed, so render each timer character in a fixed-width inline cell (digits 0.62em, colons 0.3em); use `font-variant-numeric: tabular-nums` as well.

| Role      | Size / line height       | Weight                 | Face    | Used for                                             |
| --------- | ------------------------ | ---------------------- | ------- | ---------------------------------------------------- |
| `timer`   | 64 / 1.0 (80 on desktop) | 600                    | display | Elapsed time on the running panel                    |
| `figure`  | 36 / 1.1                 | 600                    | display | Headline totals                                      |
| `title`   | 28 / 1.15                | 600                    | display | Screen titles, day headings                          |
| `heading` | 21 / 1.25                | 600                    | display | Section and sheet titles, running work item name     |
| `body`    | 17 / 1.4                 | 400 (600 for emphasis) | text    | Rows, inputs, notes                                  |
| `label`   | 15 / 1.35                | 400                    | text    | Field labels, secondary lines                        |
| `caption` | 13 / 1.3                 | 400                    | text    | Times on the trail, axis labels. Nothing is smaller. |

Sentence case everywhere. Notes and descriptions wrap at about 70 characters on desktop.

## Space, shape, motion

- Spacing scale `--ht-space-1…8`: 4, 8, 12, 16, 24, 32, 48, 64. Page gutter 16 on phones, 24 from 768 px, 32 from 1024 px.
- Radii by role, not one value: blaze 2; controls and menus 12; filter chips fully round; sheets 20 on the top corners; the running panel has none on phones (a full-bleed band) and 16 on desktop.
- Hairlines are 1 px `line`; control borders 1 px `line-strong`. Overlays use `--ht-shadow-overlay: 0 8px 32px rgb(23 33 29 / 0.18)` in light and a `line` border in dark. Static content has no shadow.
- Touch targets at least 44 × 44. Start and Stop are 60 high and full width on phones.
- Focus: 2 px ink outline with 2 px offset, visible on every interactive element.
- Motion: 120 ms for presses, 200 ms for sheets and menus, easing `cubic-bezier(.2,.8,.2,1)`. The single authored moment is Start: the blaze paints in from top to bottom and the wash fades in over 320 ms. Nothing else moves by itself. Under `prefers-reduced-motion` use opacity only.
- Breakpoints: 768 px (two columns) and 1024 px (sidebar navigation). Layers: navigation 30, menus 40, sheets 50, toasts 60.
- App icon: three white blazes in the "start of trail" arrangement (one above two) on `brand`.

## Components

Build these once in `apps/web/src/lib/components/` and show every one, in every state and both themes, on an unlinked `/dev/gallery` route. Pages compose them and add no colours or sizes of their own.

| Component                                       | Specification                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Blaze`                                         | Upright rectangle, radius 2. Sizes 4×14, 6×20, 8×28. An archived type shows as an outline.                                                                                                                                                                                                                                             |
| `TypeTag`                                       | Blaze plus the type name in ink.                                                                                                                                                                                                                                                                                                       |
| `Button`                                        | Primary (ink fill, paper text), secondary (outline), quiet (text only), danger (danger text and outline). Heights 60, 48 and 36 (36 on desktop only). The label says what happens: "Stop", "Save changes", "Download backup". Start and Stop are primary ink buttons; there is no green or red.                                        |
| `RunningPanel`                                  | Wash band with TypeTag, work item name (`heading`), elapsed (`timer`), one line "Started 4:02 AM at 第1寺院", then Stop (wide) and Switch (narrow). Untitled sessions show a "Name this session" field in place of the name.                                                                                                           |
| `DayRibbon`                                     | Horizontal 24-hour track, 12 px tall on `sunken`; sessions are segments in their mark colour; a 2 px ink tick marks now; captions at 12a, 6a, 12p, 6p. Tapping a segment opens that session.                                                                                                                                           |
| `TrailList`                                     | History's vertical trail: a 32 px rail with the trail line; each session row has its start time in `caption` at the left, a 4 px mark-coloured segment on the rail for the row's height, then name, "Work at 第1寺院", the note's first line, and the duration right-aligned. Rows are not to scale; the ribbon above gives the scale. |
| `GapRow`                                        | Dashed trail segment, `ink-3` text "1h 30m not recorded", quiet "Add" button.                                                                                                                                                                                                                                                          |
| `WorkItemRow`                                   | Blaze, name, project in `label`, and a trailing 44 px Start button. Tapping the row starts it; a long press or the trailing menu opens details.                                                                                                                                                                                        |
| `Field` and inputs                              | Label above, hint below, inline error. Text input, auto-growing text area, native select on phones, native `datetime-local`, switch, stepper, segmented control. Inputs are `surface` with a `line-strong` border, 48 high, 17 px text.                                                                                                |
| `Sheet`                                         | Bottom sheet on phones (scrim, close button, safe-area padding, no drag gesture needed), centred dialog 480–560 px on desktop. Owns focus trapping and return.                                                                                                                                                                         |
| `ConfirmDialog`, `Menu`, `Toast`, `Banner`      | Toasts sit above the tab bar for six seconds and can carry Undo. Banners are inline notices (neutral, caution, danger) with an icon and a sentence.                                                                                                                                                                                    |
| `SyncBadge`                                     | Icon and words for the sync states in SPEC.md (What the user sees). Tapping opens sync details.                                                                                                                                                                                                                                        |
| `TabBar` and `Sidebar`                          | Five destinations: Home, History, Items, Reports, Settings. Bottom bar with icon and label on phones; a 220 px sidebar from 1024 px. The selected item is ink with a small horizontal blaze in ink (16 × 4, never a type colour); unselected items are `ink-2`.                                                                        |
| `StatTile`, `BarChart`, `HBarList`, `DataTable` | Inline SVG charts drawn by hand, no chart library. Bars are mark colours with a 2 px gap between stacked segments, values in text beside or above, a table of the same numbers below every chart.                                                                                                                                      |
| `EmptyState`                                    | One sentence and one action: "No sessions on this day. Add session".                                                                                                                                                                                                                                                                   |
| `ReviewItem`                                    | Icon, one neutral sentence, and inline actions.                                                                                                                                                                                                                                                                                        |

## States and details (added 2026-11-12, task 0.4)

Decisions that fill gaps in the component table. Tokens named here live in `tokens.css`.

**Interaction states.** Hover styles apply only under `@media (hover: hover)`.

| State                      | Primary button                                                                                                       | Secondary, quiet, menu item, row      | Danger button               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------- |
| Hover                      | fill `--ht-ink-hover`                                                                                                | background `--ht-hover`               | background `--ht-hover`     |
| Pressed                    | fill `--ht-ink-hover`, `scale(var(--ht-press-scale))` over 120 ms                                                    | background `--ht-pressed`, same scale | same                        |
| Disabled                   | fill `sunken`, text `ink-3`, no border                                                                               | text `ink-3`, border `line`           | text `ink-3`, border `line` |
| Busy (transaction pending) | Disabled behaviour with the label unchanged and `aria-busy`; no spinner, because local writes settle in milliseconds | same                                  | same                        |

Disabled controls use `aria-disabled` styling only when they must stay focusable (for an explanatory tooltip); otherwise the native `disabled` attribute.

**Selection is ink.** Segmented control: a `sunken` track; the selected segment is `surface` with a `line-strong` border, ink text at weight 600; unselected segments are `ink-2`. Filter chips: unselected `line-strong` outline with `ink-2` text; selected ink fill with paper text. Switch: on is an ink track with a paper knob; off is a `sunken` track with a `line-strong` border and a `surface` knob; the label sits to the left and the whole row is the target.

**Fields.** Error: border `danger`, and below the field an alert icon plus the message in `danger` (`label` size), linked with `aria-describedby`. Disabled: `sunken` background, `ink-3` text. Hints are `label` size in `ink-2`. The stepper is a 48 px field flanked by two 48 px secondary buttons (minus, plus) with a visible label above.

**Overlays.** Sheet and dialog: `surface`, `--ht-shadow-overlay` and `--ht-overlay-border`, scrim `--ht-scrim`; a 44 px quiet close button with an X icon at the top right; the title in `heading`. The desktop dialog takes radius 20 on all corners. Menu: `surface`, overlay shadow and border, radius 12, items 44 high in `body`, destructive items in `danger`. Toast: `surface`, overlay shadow and border, radius 12, `body` text, at most `--ht-dialog-min` wide, centred above the tab bar (bottom-right on desktop); its actions are quiet buttons; six seconds, paused while hovered or focused; announced through a polite live region.

**Banners** carry no box: an icon (20 px) in `ink-2`, `caution` or `danger`, the sentence in ink, an optional quiet action at the end, and a hairline above and below. The word for the state appears in the sentence ("Couldn't reach the cloud…"), so colour is never the only signal.

**Icons.** Lucide, stroke width 1.75, `currentColor`, `--ht-icon` (20 px) in rows and buttons, `--ht-icon-sm` (16 px) beside captions. An icon-only button has an `aria-label` and a 44 px target.

**Loading.** Local reads are immediate, so there are no skeletons or spinners for local data. The only waiting states are network ones, shown in words by `SyncBadge`.

**Archived** types show an outline blaze: a 1 px border in the mark colour, no fill, and "Archived" in `ink-2` beside the name where the context needs it.

**Charts.** `HBarList` bars are `--ht-bar` (8 px) thick on a `sunken` track with the value as text at the end. `BarChart` stacks use `--ht-stack-gap` between segments, captions in `caption` size, `line` gridlines, no axis lines other than the baseline. `StatTile`: the figure in `figure`, the label below it in `label`, `ink-2`; no box.

**Theme.** `data-theme` on `<html>` (`light`, `dark`, or absent for system) is the only switch; components never read the theme.

## Voice

Plain verbs, sentence case, no exclamation marks, no apology. One name per thing through the whole app: Start, Stop, Switch, Add session, Work item, Activity type, Place, Note, Not recorded, Untitled session, Backed up, On this device only. An error says what happened and what to do: "Couldn't reach the cloud. Your changes are saved on this phone and will upload when you're back online." Durations read `2h 14m` in lists and `2:14:07` on the live timer; times and dates follow the device locale.

## Keeping the build on the design system

This document is the contract. The direction is decided; implementation applies it and does not reopen it. Conformance comes from four things, in this order of reliability:

1. **Mechanical checks.** The stylelint rule (tokens only, no raw colours, no off-scale lengths), the contrast test over `tokens.css`, and `svelte-check`. These run in `pnpm check`, so Codex cannot pass a task while breaking them.
2. **One component library.** Pages may only compose components from `src/lib/components/`. A UI brief names the components to use and cites the DESIGN_SYSTEM subsections that apply. Codex may not add a token, a colour, a font size or a new shared component; if it needs one, it reports `blocked` or lists it under `docs_notes`, and you decide.
3. **The fixed screenshot set.** `pnpm shots` renders every route at 390×844 and 1280×800 in light and dark with Chinese seed data. You open the images for every UI task.
4. **The review checklist below**, applied by you to those screenshots.

Design review checklist for every UI task:

- Colour appears only as an activity type's blaze, trail segment, chart bar or wash. Buttons, links, selection and focus are ink.
- Timers, figures and titles are in the display face; everything else is the system face. No size outside the type table; nothing below 13 px.
- No card around a list, no shadow on static content, no text on a blaze colour, at most one wash on the screen.
- None of the "avoid" items: uppercase or tracked labels, middle-dot separators, arrows on buttons, gradients, one radius everywhere.
- Every type colour has its name beside it. Chinese names and a long English name both fit without clipping at 390 px.
- Targets are at least 44 px; Start and Stop are 60 px; focus is visible when tabbing; the layout respects safe areas.
- Wording uses the vocabulary in Voice; empty and error states say what to do next.
- Both themes look intended, not inverted by accident.

**Whether to load the `frontend-design` skill.** That skill is for making new visual decisions, and it pushes toward taking aesthetic risk. Routine conformance review does not need it, and Codex agents do not have it; the checklist and the mechanical checks do that job. Load it yourself at three points only:

- **Task 0.4 and Gate 0**, when the system first becomes pixels and gaps in this specification show (a state or component not described here).
- **Whenever a screen needs something this document does not cover**: a new component, a new layout, a new chart. Make the decision with the skill, write it into `DESIGN_SYSTEM.md` first, then brief Codex against the updated document.
- **Task 4.6**, the polish pass over the whole app.

When you load it, treat this document as the brief that already pins the direction (the skill's own rule is that the brief's words win): extend Blaze by its five rules, and do not replace the palette, the faces or the layout concept. If the `dataviz` skill is available, load it before briefing task 4.2 for chart mark and interaction rules, keeping the type colours defined here.
