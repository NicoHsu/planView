# TestFlight QA Checklist

## Release Gate

No-Go if any of these fail:

- Active session is lost after app restart.
- Expired session does not open reflection.
- Session can be submitted twice.
- Partial or blocked session can be submitted without a reason.
- Notification remains scheduled after pause, completion, or cancellation.
- History and task pool become inconsistent after completion.
- App crashes during the core loop.

## Devices

Minimum matrix:

- iPhone SE or smallest currently supported iPhone.
- Latest iPhone Pro.
- iPad, because `supportsTablet` is enabled.
- iOS latest public release.
- iOS previous major public release.

## Permission States

Test all:

- Notifications allowed.
- Notifications denied.
- Notifications denied first, enabled later in Settings.

## Core Flow

1. Fresh install.
2. Add a task from Today.
3. Start a 15 minute session.
4. Pause.
5. Close and reopen the app.
6. Resume.
7. Lock screen.
8. Wait for notification.
9. Open from notification.
10. Submit reflection as `done`.
11. Confirm active session is cleared.
12. Confirm history includes the session.
13. Confirm completed task is removed from task pool.

## Partial / Blocked Flow

1. Add a task.
2. Start a session.
3. End early.
4. Select `有進展` or `沒完成`.
5. Try submitting without reason.
6. Confirm app blocks submission.
7. Select a reason.
8. Select next action:
   - `繼續排下一輪`
   - `延後到稍後`
   - `先丟棄`
9. Confirm task pool behavior matches the selected action.

## Background / Restart

Test:

- App backgrounded shorter than session duration.
- App backgrounded longer than session duration.
- App force-quit during active session.
- App force-quit during paused session.
- Device reboot during active session.
- Device reboot after session expiration but before reflection.

Expected:

- Active sessions recover from stored `endAt`.
- Paused sessions keep remaining time stable.
- Expired sessions show reflection.
- No duplicate history record is written.

## Time And Locale

Test:

- 12-hour and 24-hour time settings.
- Taipei time zone.
- New York time zone.
- Date crossing midnight.
- Manual system time change forward.
- Manual system time change backward.

Expected:

- Remaining time never displays negative.
- Daily summary remains understandable.
- Session can still be completed once.

## Accessibility

Manual pass:

- VoiceOver reads Today, Focus, Reflection, and History controls.
- Timer is understandable with VoiceOver.
- Dynamic Type large text does not hide primary actions.
- Tap targets are at least 44pt for primary controls.
- Color contrast remains usable in light and dark appearances.

## App Store Review

Check before submission:

- Privacy Policy URL is public.
- Support URL is public.
- App screenshots match current UI.
- No medical or ADHD treatment claims.
- No promise of cross-device sync.
- Notifications are described as focus block reminders only.
- If paid features are added, Apple IAP is used.
