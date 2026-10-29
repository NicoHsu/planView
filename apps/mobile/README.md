# PlanView Mobile

Expo iOS app for the PlanView timeboxing loop.

Requires Node.js 24. Current stack: Expo SDK 58, React Native 0.88, React 19.3.

## Run

```bash
npm install
npm run mobile
npm run mobile:ios
```

## Build For iOS

```bash
npm run ios:release:check
npm run ios:build:preview
npm run ios:build:production
npm --workspace apps/mobile run submit:ios
```

EAS build and submit require Expo and Apple Developer authentication.

## Current MVP

- Today task pool.
- Quick add with tags and estimate minutes.
- Focus timer based on `endAt`.
- Local notifications when a focus block ends.
- Pause/resume with notification rescheduling.
- Progress reflection with outcome and reason.
- SQLite local storage.
- History, tag summary, and plan-vs-actual insight.

## Store Notes

- The app is local-first and does not include account sync yet.
- Notifications are used only for focus block reminders.
- Do not describe the app as medical treatment or diagnosis support.
- Store metadata draft: `docs/store/APP_STORE_METADATA.md`
- Privacy policy draft: `docs/store/PRIVACY_POLICY.md`
- TestFlight checklist: `docs/store/TESTFLIGHT_QA.md`

Release evidence and remaining account/device gates: `../../docs/RELEASE_STATUS.md`.
