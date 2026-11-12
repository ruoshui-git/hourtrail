# Hourtrail UI and UX decisions

Durable screen layouts, flows and interaction decisions. Visual rules live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); data and sync behaviour in [SPEC.md](SPEC.md). Before a user-facing change, read the relevant section; after it, update the section and add one changelog line.

## Home (phone)

```
 Thu 12 Nov                 Backed up        Thu 12 Nov                 Backed up
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 ▮ Work                                      Not tracking
 库存管理系统开发                             ┌──────────────────────────────────┐
 2:14:07                                     │              Start               │
 Started 4:02 AM at 第1寺院                   └──────────────────────────────────┘
 ┌───────────────────────┐ ┌────────┐         Search or name a work item
 │         Stop          │ │ Switch │
 └───────────────────────┘ └────────┘
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 Today    5h 12m work    1h 05m other         Today    3h 00m work
 ░░░░████░░██████░░░▒▒░░|░░░░░░░░░░░           ░░░░████░░░░░░░░░░░░░|░░░░░░░░░░░░
 12a     6a      12p      6p

 Yesterday: 3 things to check
 Pinned
 ▮ Inventory Software Development  ▷
 ▮ Building Maintenance            ▷
 Recent
 ▮ 修复洗手台                        ▷
```

- Idle: the Start button begins an untitled session. Tapping a pinned or recent row starts that item at once. Typing in the field filters items; Enter on a new name creates the item (default type Work) and starts it.
- Running: tapping a row, or Switch, switches. The TypeTag opens a type picker. The name opens the item picker. A session can be named, typed and noted at any time without stopping it.
- After Stop: a toast "Stopped at 7:00 AM. 2h 58m" with Undo and "Add note", which opens the session editor. Nothing is required.
- On desktop the running panel and today's summary sit in a left column and the item lists in a right column.

## History

- Phone: a date header with previous and next, the DayRibbon, the day's totals, then the TrailList with GapRows. Tapping a session opens the session editor sheet; tapping a GapRow's Add opens it prefilled with the gap's bounds. A "Review" control at the top opens Daily review for that day when it has issues.
- Desktop: a day list and trail on the left, the session editor as a permanent right pane, and a search bar with filters (text across item names and notes, type, project, place, date range) that turns the left pane into a results table.

## Session editor (sheet or pane)

Work item picker, type, start and end (`datetime-local`), computed duration, note (large text area), place (picker, "Remove coordinates"), then Split, Merge with adjacent, Delete. Changes save on blur with a brief "Saved" confirmation. Warnings (overlap, long duration) appear inline as caution banners.

## Items, Reports, Settings

- **Items**: search, pinned first, then active items grouped by project, with an archived section. The item page shows its fields, total time and its sessions.
- **Reports**: a segmented range control, the headline figure "Work hours" with other types beside it, the bar chart by day, breakdown tabs (Work items, Projects, Places), then "Create report", which opens the report builder with a live print preview and Export (Print, CSV, Excel).
- **Settings**: Activity types (reorder, colour, counts as work, reminders, archive), Places, Reminders, Cloud and devices (sync state, link a device, revoke), Privacy (location capture, raw coordinates), Backup (download, restore, last nightly backup), Appearance (system, light, dark), Time zone and week start, Deleted sessions, About.

## Changelog

One line per behaviour change, newest first: `YYYY-MM-DD task-id: what changed and why`.

- 2026-11-12 1.3: Settings home lists all sections (unbuilt ones say "Coming soon"); Activity types (add, rename, colour, reorder, counts as work, remind, archive with Undo) and Appearance (System, Light, Dark, stored per device) work.
- 2026-11-12 1.8a: Added the app frame (tab bar on phones, sidebar from 1024 px), five placeholder destinations, the offline shell, the "Update ready. Reload" toast and the iPhone install hint.
- 2026-11-12 0.4b: Added sheet, confirm dialog (with typed confirmation), menu, toasts with Undo, banners and empty state to the gallery; overlays open from `?open=<id>` for screenshots.
- 2026-11-12 0.4d: Added stat tiles, the stacked bar chart, the bar list and the data table to the gallery. Column totals show only where they fit; the tooltip and table always carry every number.
- 2026-11-12 0.4c: Added the running panel, day ribbon, trail list, gap and work item rows, review items, tab bar, sidebar and sync badge to the gallery.
- 2026-11-12 0.4a: Added the unlinked /dev/gallery with a theme control (System, Light, Dark) and repeatable phone and desktop screenshots in both themes.
- 2026-11-12 0.1: Initial screens and flows split from the implementation plan.
