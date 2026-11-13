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

## Cloud and devices (Settings → Cloud and devices, `/settings/cloud`; `/link`)

Decided 2026-11-13 for task 3.2. Recording never depends on being signed in: every state below keeps Start and Stop working locally.

- **Signed out** (never signed in, signed out, or the server answered 401): a line "On this device only. Sign in to back up and sync your records." and two forms, one visible at a time through a segmented control: **Account key** (key field, device name, "Sign in") and **Code from another device** (code field `XXXX-XXXX`, device name, "Link this device"). The key field turns off autocorrect, autocapitalize and spellcheck and accepts the key with or without dashes and spaces. The device name is prefilled with a guess ("iPhone", "iPad", "Mac", "Windows PC", "Android phone", otherwise "This device") and accepts any Unicode, up to 60 characters.
- **Errors** appear inline under the form, never as a toast: wrong key "That account key does not match."; bad code "That code is not valid. Codes work once, for five minutes."; lockout "Too many attempts. Try again in 15 minutes." (minutes from the server, rounded up); offline "You're offline. Sign in when you have a connection."
- **Signed in**: "Signed in as {device name}", then the devices list: name, "This device" for the current one, "Last seen" as a relative day and time ("Today, 9:41 AM", "Yesterday, 6:02 PM", otherwise the date). Every other device has "Revoke", confirmed with "Revoke {name}? It will be signed out and stop syncing. Its records stay on that device." Then "Link a device" and "Sign out".
- **Link a device** opens a sheet: a QR code (ink on paper, both themes), the code in large type as `XXXX-XXXX`, the link as selectable text, and "Expires in 4:59", counting down. When it expires: "This code has expired." with "New code". The QR encodes `{origin}/link#XXXX-XXXX`. The code sits in the fragment, so it never reaches server logs or a Referer header.
- **`/link`** (opened from the QR code or link): "Link this device" with the code prefilled from the fragment, which is removed from the address bar at once, plus the device name and "Link this device". On success it goes to `/settings/cloud`. If the device is already signed in it says "This device is already signed in as {name}." and links to Settings.
- **Sign out** confirms: "Sign out of this device? Your records stay here. New changes stay on this device until you sign in again."
- A 401 from any request flips the app to signed out and shows a banner on Settings → Cloud and devices: "You were signed out. Sign in again to back up your records." The last known signed-in device is kept on the device, so opening the app offline does not show "signed out".

## Sync status, details and the clock (task 3.4)

Decided 2026-11-13. Words and states follow SPEC "What the user sees"; this section fixes placement and copy.

- **Badge placement**: on phones the `SyncBadge` sits at the right of Home's date line (as in the Home sketch). On desktop it sits in the sidebar footer on every screen. Settings → Cloud and devices shows the same badge under "Signed in as …". Signed out, it reads "On this device only".
- **Sync details** (tapping the badge opens a sheet): the state sentence, then "Last backed up: Today, 9:41 AM" (or "Not backed up yet"), then "3 changes waiting" when the outbox is not empty, and a "Sync now" button (disabled while a sync runs, labeled "Syncing…"). Offline: "You're offline. Your changes are saved on this device and will upload when you're back online." Error: the engine's last error sentence and "Try again". Signed out: "Sign in to back up and sync your records." with a link to Cloud and devices.
- **Changes the cloud did not accept** (the engine's rejected list, newest first, at most 20 shown): a heading "Not accepted by the cloud", one line per change ("Session edit, 9:41 AM: {reason}"). They stay on this device. Nothing here is dismissible yet; a "Copy details" button copies the list for a bug report.
- **Pending dots**: session rows in History and Home's Recent list, and work item rows, show the existing hollow pending dot (`pending` prop, aria-label "Not backed up yet") while that record has a change in the outbox.
- **Clock caution**: when the stored server clock offset exceeds 2 minutes, Home shows a caution banner under the date line: "This device's clock is {N} minutes {ahead|behind}. Sessions started or stopped now are marked for review." Sessions started or stopped while the caution applies get `flags.clock_suspect`, which Daily review already lists as "Check session times". While the app is open, a jump of more than 2 minutes between the wall clock and the monotonic clock during a running session marks that session too. Recorded times are never corrected automatically.

## Changelog

One line per behaviour change, newest first: `YYYY-MM-DD task-id: what changed and why`.

- 2026-11-12 2.4: Settings > Places: add and edit places (typed or current coordinates, radius 25-2000 m, Open in Maps link), merge duplicates with one Undo, archive places in use, delete unused ones.
- 2026-11-12 1.6: Session editor in a sheet: edits save on blur; manual entry uses "Add session"; end-before-start and nonexistent times are blocked, ambiguous times take the earlier instant; overlap, >16 h and future-start warnings; delete with Undo.
- 2026-11-12 1.7: History: day header with previous, next and Today; ribbon; totals; trail rows per session slice ("Continued from yesterday", "Continues tomorrow"); gap rows of at least `long_gap_min` between the day's first and last sessions, with Add.
- 2026-11-12 1.9: Settings > Backup downloads (or shares, on iPhone) a full backup file, shows the last backup date and cautions when none exists or it is over 30 days old; restore comes with cloud sync.
- 2026-11-12 1.4: Items: search, Pinned, items grouped by project, Archived; item pages edit on blur and list the item's sessions; delete only for items with no sessions.
- 2026-11-12 1.5: Home: Start, naming, running panel with Stop (Undo, Add note) and Switch, today's totals and ribbon, Pinned and Recent (Recent omits the running item). Ribbon segments are labelled "<item>, <start> to <end or now>".
- 2026-11-12 1.3: Settings home lists all sections (unbuilt ones say "Coming soon"); Activity types (add, rename, colour, reorder, counts as work, remind, archive with Undo) and Appearance (System, Light, Dark, stored per device) work.
- 2026-11-12 1.8a: Added the app frame (tab bar on phones, sidebar from 1024 px), five placeholder destinations, the offline shell, the "Update ready. Reload" toast and the iPhone install hint.
- 2026-11-12 0.4b: Added sheet, confirm dialog (with typed confirmation), menu, toasts with Undo, banners and empty state to the gallery; overlays open from `?open=<id>` for screenshots.
- 2026-11-12 0.4d: Added stat tiles, the stacked bar chart, the bar list and the data table to the gallery. Column totals show only where they fit; the tooltip and table always carry every number.
- 2026-11-12 0.4c: Added the running panel, day ribbon, trail list, gap and work item rows, review items, tab bar, sidebar and sync badge to the gallery.
- 2026-11-12 0.4a: Added the unlinked /dev/gallery with a theme control (System, Light, Dark) and repeatable phone and desktop screenshots in both themes.
- 2026-11-12 0.1: Initial screens and flows split from the implementation plan.
