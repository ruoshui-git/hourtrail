# Personal Work & Activity Tracker `Hourtrail`
## Product Requirements — Version 1.0

**Status:** Requirements approved for architecture planning  
**Target:** iPhone-first, offline-capable Progressive Web App  
**Hosting preference:** Cloudflare, free tier wherever practical  
**Language:** English UI with complete Unicode data support

---

## 1. Product vision

Build a lightweight personal time-tracking application that makes it exceptionally easy to record, organize, review, and report time spent on work, volunteering, and personal activities.

The application will replace the need to manually maintain daily work-time records in Notion. It should also provide convenient location recognition and help reconstruct activities that were not recorded in real time.

The core philosophy is:

**Start recording immediately. Add details whenever convenient. Correct mistakes easily.**

The application should prioritize everyday convenience, reliability, and data ownership over advanced project-management functionality.

App name: Hourtrail

### Primary goals

1. Record activities quickly through a Start/Stop timer.
2. Resume existing work without reentering its information.
3. Maintain separate time sessions for repeated work.
4. Allow comprehensive historical editing and manual entries.
5. Recognize previously saved physical locations.
6. Help identify missing or incomplete daily records.
7. Generate useful statistics and weekly/monthly reports.
8. Work offline and synchronize securely between iPhone and computer.
9. Minimize hosting, maintenance, and operating costs.

### Intended users

Initially a single personal user, accessing the same records from an iPhone and desktop browser.

Multi-user collaboration, employee management, and organization-level permissions are not required.

---

## 2. Language and internationalization

The entire application interface must be in English.

This includes navigation, buttons, dialogs, settings, system messages, built-in labels, and default activity names.

Do not introduce hardcoded Chinese interface strings.

However, **all user-provided content must fully support Unicode**, including Chinese characters, punctuation, symbols, and mixed-language text.

Requirements:

- Preserve Unicode correctly throughout input, storage, synchronization, display, searching, backups, and exports.
- Do not transliterate, escape visibly, replace, or corrupt non-ASCII characters.
- Support names and descriptions such as `库存管理系统开发`, `第1寺院`, and `修复洗手台`.
- Ensure CSV/Excel exports can be opened without garbled Chinese characters.
- Default system-generated report headings to English.
- Permit user-defined report titles and labels in any language.

Multilingual application interfaces are not required.

---

## 3. Configurable activity types

Provide a configurable classification system.

### Default types

- Work
- Volunteer
- Personal

These are starting defaults, not permanently hardcoded categories.

### Management

Users must be able to:

- Create additional activity types.
- Rename existing types.
- Select an identifying color.
- Reorder types.
- Archive or deactivate types.
- Assign or change a type on individual sessions.

Deleting or renaming an activity type must not accidentally destroy or corrupt historical records.

### Reporting behavior

Each type should have configurable reporting behavior, particularly whether its hours count toward the primary work-hour total.

Default behavior:

- Work: counted in work hours.
- Volunteer: recorded separately.
- Personal: recorded separately.

The system must not rely on a type's display name to determine reporting behavior.

Changing a type's name must not change its meaning or corrupt reports.

---

## 4. Work items and sessions

This is the most important data-model requirement.

### Work items

A work item represents an activity that can be performed multiple times.

Examples:

- Inventory Software Development
- Building Maintenance
- Event Preparation
- Personal Errands

Each work item should support:

- Name.
- Optional description.
- Default activity type.
- Optional category or project grouping.
- Optional default location.
- Active/archived status.

Users should be able to search, edit, archive, and reuse work items.

Frequently used work items should be pinnable.

### Work sessions

Each period spent working on an item is recorded as an independent session.

For example:

**Inventory Software Development**

- Session A: 4:00 AM–7:00 AM, permission development.
- Session B: 9:00 AM–11:30 AM, import testing.

Both sessions belong to the same work item but remain separate records.

Each session should store:

- Associated work item.
- Activity type, initially inherited from the work item but overridable.
- Start and end timestamps.
- Calculated duration.
- Optional session-specific notes.
- Optional location information.
- Creation and modification timestamps.
- Whether it was recorded live or added manually.

Changes to a work item's default activity type must not silently rewrite the classifications of previously recorded sessions.

Sessions must remain associated with their work item even when names or descriptions change.

Historical work items and sessions must be preserved when a work item is archived.

---

## 5. Live time tracking

### Starting a session

The main screen must make starting work extremely convenient.

Primary options:

- Start a new work item.
- Resume a recent work item.
- Select a pinned work item.
- Search for an existing work item.

When resuming an existing work item, create a **new independent session**.

Do not append new time to an earlier completed session.

The user should not need to enter notes or complete a form before starting.

Starting a session must immediately record the start timestamp locally.

GPS requests, cloud synchronization, and other secondary operations must not delay recording the start time.

### During a session

Show:

- Current work item.
- Activity type.
- Start time.
- Elapsed duration.
- Location, if available.

The user should be able to close the PWA or lock the phone without losing the session.

Elapsed time must be calculated using timestamps, not by relying on an uninterrupted browser timer.

### Ending a session

One tap should end the session and immediately persist the end timestamp.

Afterward, the user may optionally:

- Enter session notes.
- Change the activity type.
- Correct the location.
- Adjust the recorded times.

All these actions must also be available later.

### Switching activities

Provide a convenient way to switch directly from one work item to another.

Switching should:

1. End the current session.
2. Start a new session for the selected work item.
3. Preserve both sessions independently.

The operation should avoid creating unintended gaps or overlaps.

The system should normally maintain one active session per user.

---

## 6. Historical records and corrections

Users must be able to create, view, edit, and delete sessions independently of the live timer.

### Manual entry

Allow creating records for any previous date, including multiple records on the same day.

The user should be able to specify:

- Work item.
- Activity type.
- Start date/time.
- End date/time.
- Session notes.
- Location, if known.

Support overnight sessions spanning two calendar dates.

Do not automatically assign the device's current GPS location to a historical session.

### Editing

Support:

- Changing start/end timestamps.
- Editing session details.
- Reassigning a session to another work item.
- Changing classification.
- Correcting location.
- Splitting a session.
- Merging compatible sessions.
- Deleting erroneous records.
- Undoing accidental actions when practical.

Warn about overlapping sessions, invalid time ranges, and other suspicious data.

Do not silently discard records.

Any time corrections must immediately update totals and reports.

---

## 7. Daily timeline

Provide a chronological timeline of recorded activity for each day.

The timeline should:

- Clearly show session start/end times.
- Display work item names.
- Distinguish activity types.
- Display recorded duration.
- Show gaps between sessions.
- Allow editing a session directly.
- Allow selecting an empty period to create a historical entry.
- Support navigation between dates.

Sessions crossing midnight should be displayed sensibly on both affected dates, without double-counting duration.

The timeline must remain usable on a small iPhone screen.

---

## 8. Daily review

Daily review is a core feature.

Its purpose is to help users reconstruct their day and improve the accuracy of historical records.

### Review checks

Identify potential issues such as:

- Unusually long unfinished sessions.
- Sessions missing descriptions.
- Unknown or unresolved locations.
- Overlapping records.
- Incomplete or suspicious timestamps.
- Unusually long gaps that the user may wish to review.

Time gaps should be presented neutrally. The application must not assume that all unrecorded time represents missing work.

### Review workflow

Users should be able to:

- Open any day's review.
- See all sessions and relevant warnings.
- Correct records in place.
- Add historical sessions.
- Mark an issue as reviewed or dismiss it.
- Finish the review without completing every item.

The app may highlight the previous day when opened, but daily review must not obstruct ordinary Start/Stop operations.

---

## 9. Location capture and recognition

Location tracking is optional and must not interfere with time recording.

### Location capture

When starting or ending a session, attempt to obtain the device's current geographic coordinates if location permission has been granted.

The application should not attempt continuous background location tracking.

It only needs location information during ordinary foreground use.

If location services are unavailable, denied, slow, or inaccurate, the session must still save successfully.

### Named locations

Provide a saved-location library.

Each saved location should support:

- User-defined name.
- Geographic coordinates.
- Configurable recognition radius.
- Optional description.
- Editing and deletion or archival.

Examples might include a workplace, temple, residence, or another frequently visited site.

### Automatic recognition

When capturing coordinates:

1. Compare the position against saved locations.
2. Consider reported GPS accuracy and configured recognition radii.
3. Assign a clearly matching location when sufficiently confident.
4. Offer a selection if several locations plausibly match.
5. Leave the location unresolved if matching is unreliable.

Avoid falsely claiming precise building-level accuracy.

### Unknown location workflow

If a location is not recognized, optionally prompt the user to:

- Save it as a new named location.
- Select an existing saved location.
- Leave it unnamed.
- Skip the prompt until later.

The prompt must not block Start/Stop.

Unresolved locations should appear in daily review.

### Location management

Provide a dedicated management interface for:

- Adding and naming locations.
- Correcting saved positions.
- Adjusting recognition radii.
- Renaming locations.
- Merging duplicates where appropriate.
- Deleting or archiving locations.
- Manually correcting session-location assignments.

### Privacy

Allow the user to:

- Disable location capture.
- Remove coordinates from particular sessions.
- Choose whether raw GPS coordinates are synchronized to the cloud.
- Retain named locations without necessarily retaining raw GPS history.

No third-party location tracking or advertising integrations.

---

## 10. Reminders and notifications

Provide an optional forgotten-session reminder.

### Configuration

Users should be able to:

- Enable or disable notifications.
- Set an elapsed-time threshold.
- Choose whether reminders repeat.
- Disable reminders for particular activity types if desired.

### Expected behavior

When a session has been active longer than the configured threshold, remind the user to check whether it should remain open.

Notifications must not automatically end the session.

The user should be able to review and correct the session afterward.

For iPhone, support standard PWA Web Push notifications where available.

Notification permission should be optional, and the app must remain fully functional when notifications are disabled.

Background notifications are best-effort, not a guaranteed timer or attendance mechanism.

If notifications are unavailable, show relevant warnings the next time the app opens.

---

## 11. Statistics and reporting

Provide useful summaries without requiring an AI service.

### Statistics

Support daily, weekly, monthly, and custom date ranges.

Include:

- Total duration by activity type.
- Primary work-hour total.
- Hours by work item.
- Hours by project/category.
- Hours by location.
- Number of sessions.
- Daily and weekly trends.
- Recent activity history.

Use straightforward charts and tables. Avoid unnecessary productivity scores.

### Reports

Generate weekly and monthly activity reports.

Reports should support:

- Configurable date ranges.
- Grouping sessions by work item/project.
- Aggregating the duration of repeated work.
- Showing session-level notes when useful.
- Separating activity types.
- Excluding Volunteer, Personal, or other types from official work totals as configured.
- Summarizing completed activities.
- Customizable report titles and headings.

The user should be able to select which activity types and records appear in an export.

### Export formats

At minimum:

- CSV.
- Excel-compatible spreadsheet.
- Printable report view.

Reports should be suitable for submission as personal work logs.

Preserve user-entered Chinese and other Unicode text correctly.

No AI-generated summaries are required. Report generation should use stored records and deterministic calculations.

---

## 12. Offline-first operation

The application must remain usable without an internet connection.

Core offline functionality includes:

- Starting and ending sessions.
- Resuming existing work items.
- Creating and editing records.
- Accessing previously cached history.
- Daily review.
- Accessing saved locations.
- Viewing locally available reports.

Record important changes locally immediately.

Synchronize when connectivity returns.

The PWA must not require an active connection to record time.

Offline changes must not disappear because the app reloads, closes, or loses connectivity.

Normal browser storage limitations should be acknowledged and mitigated, with recovery and backup mechanisms.

---

## 13. Cloud synchronization

Use Cloudflare as the preferred hosting and backend platform.

The exact architecture should be selected during technical design.

Cloudflare Workers, static assets/Pages, and D1 are acceptable candidates.

### Requirements

- Secure synchronization between iPhone and desktop.
- Access to the same work items, sessions, types, and saved locations.
- Changes made on either device eventually appear on the other.
- Offline changes synchronize after reconnection.
- No duplicate records caused by repeated submissions.
- No silent loss of edits.
- Clear indication of synchronization state.
- Safe handling of conflicts.
- Protection against unauthorized access.

Special attention should be paid to changes made on multiple devices, including overlapping live sessions or simultaneous edits.

Synchronization must distinguish a record being saved locally from being successfully backed up to the cloud.

### Hosting cost

Target $0/month within Cloudflare's free allowances.

Avoid unnecessary third-party services, paid infrastructure, and recurring fees.

If a feature cannot be implemented reliably within the free tier, document the limitation and recommend the simplest reasonable alternative.

---

## 14. Backup, restore, and data ownership

Synchronization alone is insufficient as a backup strategy.

The application must offer:

- Full export of personal data.
- A structured, portable backup format.
- Import/restore from a supported backup.
- Preservation of relationships between work items, sessions, types, and locations.
- Clear safeguards against accidental data replacement.
- Recovery procedures for a lost or replaced device.

Prefer an additional independent backup mechanism that can operate within the free hosting limits.

Backup and restoration must be tested.

No historical import from Notion is required.

---

## 15. Security and privacy

The application contains personal activity and location history, so data security is important.

Requirements:

- Secure authentication for cloud data.
- HTTPS for all network communication.
- Server-side authorization checks.
- No public access to private records.
- No hardcoded credentials or secrets in frontend code.
- Protection against unauthorized record modification.
- Appropriate session and token handling.
- Minimal collection of personal information.
- Ability to export and delete user data.

Avoid complex organization-level account management.

Initially, the application only needs to serve one user's personal account across multiple devices.

---

## 16. User experience and interface

### Design principles

- Mobile-first.
- Minimal and uncluttered.
- Very fast access to the current session.
- Large, obvious Start/Stop controls.
- Few required fields.
- Editing and organization can happen later.
- Clear feedback when actions succeed or fail.
- Accessible and touch-friendly.

### Primary areas

The application should have simple navigation covering:

1. **Home** — Start/Stop, active session, recent and pinned work.
2. **History** — Daily timeline and historical records.
3. **Work Items** — Reusable activities and optional project grouping.
4. **Reports** — Statistics and exports.
5. **Settings** — Activity types, locations, reminders, cloud sync, privacy, and backup.

Daily review may be incorporated into Home or History rather than requiring a separate navigation destination.

### Desktop experience

Use the same application with a responsive layout appropriate for larger screens.

The desktop interface should be particularly convenient for:

- Editing historical records.
- Writing detailed session descriptions.
- Searching records.
- Reviewing reports.
- Exporting data.

### Appearance

Support light and dark appearance where practical.

Keep the interface consistent and visually restrained.

---

## 17. PWA requirements

The application must:

- Install on an iPhone Home Screen.
- Run in a standalone, app-like interface.
- Work over HTTPS.
- Support offline access.
- Resume previously saved data after reopening.
- Handle application updates without destroying local records.
- Work in current major desktop browsers.
- Provide a graceful experience when browser capabilities are unavailable.

No Apple App Store distribution is required.

No native iPhone application is required.

No Apple Shortcuts integration is required.

---

## 18. Correctness and reliability

Time-tracking accuracy is essential.

The design must handle:

- Browser and PWA termination.
- Device locking.
- Internet loss.
- Unavailable GPS.
- Delayed GPS results.
- Repeated button presses.
- Duplicate network requests.
- Offline editing.
- Cross-device editing conflicts.
- Overnight sessions.
- Time-zone changes.
- Daylight Saving Time transitions.
- Device clock changes.
- Overlapping historical entries.
- Unexpected application updates.
- Backup restoration.

Use correct timestamp handling so that elapsed durations, calendar-day allocation, and reporting totals remain consistent.

Prevent double-counting.

Avoid data loss when operations fail partway through.

---

## 19. Explicitly excluded features

The following are not part of this project:

- Native iOS application development.
- App Store publishing.
- Apple Shortcuts or Lock Screen widgets.
- Continuous background GPS tracking.
- Lifecycle-style automatic travel history.
- Notion historical data import.
- Built-in voice recording or transcription.
- Photo attachments.
- AI-generated activity descriptions or reports.
- AI API dependencies.
- Calendar integration.
- Employee/team management.
- Payroll processing.
- Invoicing.
- Complex project-management functionality.

Ordinary iPhone keyboard dictation remains available through the operating system and needs no special implementation.

Avoid adding unnecessary features that complicate the basic experience.

---

## 20. Development priorities

Organize implementation into independently testable milestones.

Suggested progression:

### Milestone 1 — Core recording

- PWA foundation.
- Work items and configurable activity types.
- Start/Stop.
- Resume previous work.
- Session notes.
- Historical editing.
- Local persistence.
- Basic daily timeline.

### Milestone 2 — Daily organization

- Daily review.
- Session correction tools.
- Switching between work items.
- Saved-location management.
- GPS capture and recognition.
- Search and filtering.

### Milestone 3 — Cloud services

- Authentication.
- Cloud database.
- Offline synchronization.
- Conflict handling.
- Desktop access.
- Backups and restore.

### Milestone 4 — Reporting and reminders

- Statistics.
- Weekly/monthly reports.
- Spreadsheet export.
- Forgotten-session notifications.
- Customization and polish.

The architecture lead may adjust milestone boundaries to reduce complexity or address dependencies.

Each milestone should be tested before progressing.

Avoid delaying usable core time tracking while implementing nonessential infrastructure.

---

## 21. Acceptance criteria

The project is successful when the following everyday scenarios work reliably:

**Scenario A — Quick start**

I open the installed PWA, select a recently used work item, and start tracking without filling out a form.

**Scenario B — Resume work**

I work on a project from 4:00 AM to 7:00 AM, stop, and resume it at 9:00 AM. The system creates two separate sessions associated with the same work item.

**Scenario C — Add details later**

I return later and add different notes to the morning and afternoon sessions without changing their work-item association.

**Scenario D — Historical entry**

I create two sessions for yesterday, assign their work items and classifications, and immediately see them in my timeline and reports.

**Scenario E — Location recognition**

I start work at a previously saved location. The app recognizes it automatically when GPS accuracy permits. At an unfamiliar location, I can save a new name or skip the prompt.

**Scenario F — Forgotten session**

I forget to stop the timer. The application reminds me when possible, lets me correct the end time, and updates totals appropriately.

**Scenario G — Offline operation**

I start and stop a session without internet access. The record remains available and later synchronizes successfully.

**Scenario H — Desktop editing**

I edit a work session from my computer and eventually see the updated record on my iPhone without duplicate sessions or silent data loss.

**Scenario I — Unicode integrity**

I enter Chinese names and descriptions on my iPhone, synchronize them, edit them on my computer, and export them. Every character remains intact.

**Scenario J — Monthly reporting**

I generate a monthly work report that aggregates hours across sessions and work items, excludes non-work activities from the primary work-hour total, and preserves my detailed session notes.

**Scenario K — Custom activity types**

I create, rename, and reorder an activity type. Existing records remain intact, and reporting behavior follows configured settings rather than the display name.

**Scenario L — Recovery**

I restore a supported backup to a clean environment and recover my records, classifications, work-item associations, and named locations correctly.

---

## 22. Instructions for architecture and implementation agents

This document describes product requirements, not a fixed technical implementation.

The architecture lead should:

1. Review the requirements for consistency, feasibility, and unnecessary complexity.
2. Design the technical architecture and data model.
3. Select appropriate Cloudflare services.
4. Define the offline synchronization and conflict-resolution strategy.
5. Design authentication, security, backup, and recovery.
6. Determine how location recognition and notifications should work within iOS PWA limitations.
7. Produce an implementation-ready technical specification and phased development plan.
8. Define meaningful tests and acceptance gates for each milestone.
9. Explain significant tradeoffs and identify any platform limitations.

Do not silently remove product requirements or add major scope.

Where multiple implementations are possible, choose the simplest maintainable design that reliably meets the requirements.

Keep ongoing costs at or near zero.

The implementation lead should follow the approved architecture, delegate coding and testing efficiently, verify milestones, and ensure the finished application meets the acceptance scenarios.

**Overall goal: A dependable, easy-to-use personal activity tracker that requires minimal effort to record work and provides accurate, editable history and useful reports.**
