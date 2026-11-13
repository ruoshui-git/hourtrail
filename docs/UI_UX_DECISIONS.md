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
- **Link a device** opens a sheet: a QR code (always dark modules on light paper, in both themes, using the `code-ink` and `code-paper` tokens, because many phone cameras cannot read an inverted code; at most 240 px wide), the code in large type as `XXXX-XXXX`, the link as selectable text, and "Expires in 4:59", counting down. When it expires: "This code has expired." with "New code". The QR encodes `{origin}/link#XXXX-XXXX`. The code sits in the fragment, so it never reaches server logs or a Referer header.
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

## Restore from a backup file (Settings → Backup, task 3.5)

Decided 2026-11-13.

- "Restore from a backup file" opens the file picker (`.json`). A file that fails validation shows "This isn't a Hourtrail backup file." or, for a newer format, "This backup was made by a newer version of Hourtrail. Update the app, then try again." Nothing is written.
- A valid file shows a summary before anything changes: "Backup from Thu, Nov 12, 2026, 9:41 AM", counts ("312 sessions, 24 work items, 6 places, …", tombstones excluded from the counts), and the date range of its sessions. Then two choices:
  - **Add what's missing** (default): adds only records whose ids are not on this device. Nothing here is changed or removed. Result: "Added 41 records. 271 were already here."
  - **Replace everything**: makes this device, and the cloud when signed in, match the backup exactly. First "Save a backup of this device" (the same download or share as Download backup); "Replace everything" stays disabled until that has happened in this sheet. Then a typed confirmation: type `replace` to enable the button. Result: "This device now matches the backup from Nov 12."
- Progress for large files: "Restoring… 1,200 of 3,400" with no cancel (each chunk is atomic; a closed app resumes from the outbox).
- Works signed out (local only; the changes upload after sign-in) and signed in.

## Raw coordinates and erasing the cloud (task 3.7)

Decided 2026-11-13.

- **Settings → Privacy** gains a switch "Back up raw coordinates" (synced setting `sync_raw_gps`, off by default) under the capture switch, with the note "When this is off, raw coordinates stay on the device that captured them, so a place that wasn't recognized can only be named on that device." Turning it on uploads this device's raw coordinates, and later captures sync. Turning it off keeps new captures on the device and shows "Delete raw coordinates from the cloud". That button confirms with "Delete raw coordinates from the cloud? Named places and session places stay. This device keeps its own copy." Afterwards the cloud and other devices hold no raw coordinates; nightly backups already taken keep them for up to 60 days, and the note under the button says so.
- **Settings → Cloud and devices → Erase cloud data** (signed in; danger button at the end of the page) opens a sheet: "This deletes every record and every device from the cloud. All devices are signed out. Nightly backups already taken stay in the backups repository for up to 60 days." Account key field (required), and a checkbox "Also erase this device" (off). The button "Erase cloud data" stays disabled until the key field is filled. A wrong key shows "That account key does not match." and counts toward the same lockout as sign-in. On success, signed out with "Cloud data erased." If the checkbox was on, the app also deletes this device's data and reloads to a fresh start.

## Reminders and "Still working?" (task 4.5)

Decided 2026-11-13.

- **Settings → Reminders**: a switch "Remind me about a session left running" (the synced `reminder.enabled`); "After" with choices 1, 2, 3, 4 (default), 6, 8 or 12 hours (`threshold_min`); "Repeat" with Once (default), Every 30 minutes, Every hour or Every 2 hours (`repeat_min`). Under them, "Remind for these types" with a switch per activity type (the type's synced `remind`). Then "Notifications on this device": a button "Turn on notifications" that requests permission and subscribes this device. Afterwards it reads "Notifications are on for this device" with "Turn off". A short note states the limits: "On iPhone, notifications work only in the app added to the Home Screen. A session must have synced for the cloud to remind you, and delivery is best effort." Signed out, notifications are unavailable: "Sign in to get reminders on this device." In-app reminders still work.
- **The notification**: title "Still working?", body "{work item or Untitled session} has been running for 4h 12m." Tapping it opens `/?check={session_id}`.
- **"Still working?" sheet** (from the notification, or once per session on opening the app with a session running past the threshold): "{name} has been running since {time} ({duration})." Three actions: "Keep running" (dismisses; the in-app prompt does not return for this session until a repeat interval has passed, if repeats are on), "Stop now", and "Stop at…" (opens an end-time field, default the threshold time, never later than now, never before the start). A reminder never ends a session by itself.

## Report builder and printing (`/reports/new`, task 4.3)

Decided 2026-11-13.

- **Layout**: on desktop, the options sit in a left column (360 px) beside a live preview of the printed page. On phones, the options come first, then "Preview", which opens the preview full screen. Header: "Create report", a back link to Reports, and Export (Print, CSV, Excel).
- **Options**, all reflected live in the preview: Title (default "Work report"); Range (This month default; Last month; This week; Custom with two date fields); Types (a checkbox per activity type, all checked by default); Group by (Work item, Project, Day, Type); "Show sessions" and "Show notes" switches; "Hours as" (2h 14m or 2.23). "Headings" is a disclosure listing each heading with a text field (placeholder the English default; any language).
- **Excluding sessions**: with Show sessions on, each session row in the preview has a checkbox (checked = included). Unchecking adds it to `excluded_session_ids`, and the row stays visible in the preview, struck through and marked "Excluded", so it can be put back. Printed and exported output omits it.
- **Presets**: "Save as preset" asks for a name (default the title) and stores a `report_preset`. A "Presets" menu at the top loads one (range presets stay relative: a preset saved on "This month" means the current month when loaded), renames or deletes. Presets sync like everything else.
- **Printed page** (A4 and Letter): the title; the range; then the "Work hours" total, stated on its own line before other types (each with its hours) and the total. Groups follow, each with its subtotal and, when shown, its session rows (date, start–end, hours, work item) with notes under each row. Table headers repeat on every page, rows never split across pages, ink on white, no app chrome. Footer: "Hourtrail · printed {date}".
- **Export**: Print opens the browser's print dialog for the preview. CSV and Excel download (or share on iPhone) the files from task 4.4, named like `hourtrail-report-2026-11`.

## Changelog

One line per behaviour change, newest first: `YYYY-MM-DD task-id: what changed and why`.

- 2026-11-13 4.3: Reports > Create report builds a report with a live preview that prints as the same page (work hours first, groups with sessions and notes), excludable sessions, custom headings, synced presets that follow the calendar, and Export (Print, CSV, Excel). Polish for 4.6: dates wrap in long rows; the Work item column repeats the group when grouping by work item; durations print 1h 0m while charts show 1h 00m.
- 2026-11-13 4.2: Reports shows Statistics: range control, Work hours headline with other types beside it, a stacked bar chart with a table of the days or weeks that have time, and breakdowns by work item, project and place. Polish for 4.6: Custom range uses text date fields until a date-only input exists; charts pad minutes (1h 05m) and ignore the decimal format while the headline does not.
- 2026-11-13 3.7: Settings > Privacy can back up raw coordinates (off by default) and delete them from the cloud (scrubbed, then deleted; this device keeps a copy). Settings > Cloud and devices can erase all cloud data with the account key, optionally wiping this device.
- 2026-11-13 3.5: Settings > Backup can restore a backup file: "Add what's missing", or "Replace everything" after saving a backup of this device and typing `replace`. Polish note for 4.6: the summary lists zero counts too.
- 2026-11-13 3.4: Signed-in devices sync. The sync badge sits on Home's date line on phones and in the sidebar footer on desktop, and opens Sync details (last backup, waiting changes, Sync now, changes the cloud did not accept). Rows with unsent changes show the pending dot. A device clock more than 2 minutes off shows a caution on Home and marks sessions for review.
- 2026-11-13 3.2: Settings > Cloud and devices: sign in with the account key or a code from another device, the device list with Revoke, Link a device (QR code, code and link, five-minute countdown), Sign out, and `/link` for the QR link. Recording never depends on being signed in.

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
