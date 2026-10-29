# PlanView iOS Product Plan

## Product Positioning

PlanView is a timeboxing coach, not a generic todo app. The core loop is:

```text
Plan the next block -> focus -> report reality -> improve the next estimate
```

The product should help users answer:

- What did I plan to finish?
- What actually happened?
- Which tags or task types do I keep underestimating?
- What should the next block be?

## iOS MVP

P0:

- Today task pool with quick add.
- Tags and estimate minutes per task.
- Start a focus session in three steps or fewer.
- End-at based timer that survives backgrounding and app restarts.
- Local notification when the focus session ends.
- Pause, resume, early end, and progress report.
- Reflection outcome: done, partial, blocked.
- Failure reason for partial/blocked sessions.
- Local-first SQLite storage.
- History timeline and tag summary.
- Plan vs actual insight per tag.

P1:

- Daily review.
- Next-block recommendation.
- Task carry-over choices: continue, split, defer, drop.
- Notification permission education and degraded state.
- Accessibility pass for VoiceOver and Dynamic Type.

P2:

- Live Activities / Dynamic Island.
- Widgets.
- Apple Calendar / Reminders import.
- iCloud sync.
- Shortcuts.
- AI task splitting and estimate suggestions.

## Non Goals For First App Store Version

- Multi-user collaboration.
- Kanban/project management.
- Calendar two-way sync.
- Cloud account and cross-device sync.
- Medical claims around ADHD, anxiety, or mental health treatment.
- Heavy gamification.
- App blocking / Screen Time integration.

## Technical Direction

- React Native + Expo for the first iOS version.
- Shared JavaScript core in `packages/core`.
- SQLite on mobile.
- JSON file storage remains acceptable for desktop MVP.
- Timer truth is `endAt`, not JS interval ticks.
- Background behavior uses local notification plus foreground recalculation.

## QA Go / No-Go

No-Go:

- Timer derives from interval state instead of absolute timestamps.
- Data disappears after app restart, crash, or backgrounding.
- A finished session can be written twice.
- Notification cancellation or rescheduling is broken.
- The app implies medical benefit or cross-device sync that does not exist.

Go:

- Core session loop works offline.
- Active or expired sessions recover after restart.
- Notifications are optional and the app still works if permission is denied.
- History and tag analytics match completed session data.
- First session can start without account setup or tutorial friction.

## Current Engineering Status

Implemented:

- Shared `packages/core` for session creation, pause/resume, completion, tag analytics, and daily insights.
- Expo iOS app with Today, Focus, locked Reflection, History, SQLite storage, and local notifications.
- Mobile active session overwrite guard.
- Mobile reflection submit guard.
- Mobile per-session notification id cancellation/rescheduling.
- Mobile completion transaction for history, active session, and task pool updates.
- Partial/blocked reflection requires a reason and next action.
- Desktop app uses shared core.
- Desktop active session persistence and restart recovery.
- Desktop pause/resume IPC and UI.
- Root `npm test` gate for core tests, Expo config, iOS export smoke, and Electron pack smoke.
- Serialized mobile actions with durable state as the source of truth.
- Reflection boundary excludes reflection/pause time and survives restarts.
- Local-calendar daily summaries use actual time and focus-end date.
- Atomic desktop completion with legacy JSON migration and duplicate protection.
- Notification failure warnings, per-task intention, focus navigation, basic accessibility roles/labels, and scrollable reflection sheets.
- Expo SDK 58 / React Native 0.88 / Electron 45 and Node.js 24.
- 26 automatic tests, 3 Electron UI tests, GitHub CI and support page sources.

Still required before App Store submission:

- TestFlight true-device matrix: background, lock screen, force quit, notification denied, time zone change.
- Final privacy policy and App Store copy review (contact and public page sources supplied).
- Real device screenshots and signing setup (icons and splash configuration supplied).
- Accessibility pass for VoiceOver and Dynamic Type.
- Native Live Activity / Widget decision for P1.
- Upstream fixes for Expo CLI Zod 3 and config deepmerge audit findings; see RELEASE_STATUS.md.
