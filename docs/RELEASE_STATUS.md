# Release status — 2026-10-29

Version: 0.1.0. Engineering MVP is verified locally. App Store submission is not complete.

## Verified

- 26 automated tests: session timing, local-day analytics, duplicate actions, permission denial, notification failures, task carry-over, restart recovery, SQLite rollback, atomic desktop persistence.
- 3 Electron UI tests: plan/start/pause/restart/resume/early finish/reflection, expired restart, paused restart.
- Expo Doctor: 20/20 checks pass.
- Expo SDK 58 config and iOS Hermes bundle export pass.
- Electron 45 macOS arm64 package smoke passes with custom icon.
- Packaged macOS arm64 app launched successfully and its preload IPC returned the current session.
- macOS x64/arm64 DMG and ZIP, Windows x64/arm64 ZIP and NSIS installers, and combined Windows installer generated successfully. Windows runtime behavior remains unverified.
- Node.js 24 and fresh dependency lock; old Expo 51 / React 18 peer packages removed.

## External gates

- Expo CLI reports `Not logged in`. Sign in before EAS project setup/build.
- Apple Developer membership, App Store Connect app record, signing and provisioning are not verified.
- This Mac has Command Line Tools only, without Xcode / `simctl`; iOS native build and device QA have not run.
- Complete the [TestFlight device matrix](store/TESTFLIGHT_QA.md), including notifications, lock screen, force quit, reboot, time changes, VoiceOver and large text.
- Capture real iPhone/iPad screenshots from the verified native build. No mock screenshot is represented as a device capture.
- Desktop installers are unsigned until Developer ID / Windows code signing is configured.
- GitHub push was rejected because the current OAuth token lacks `workflow` scope. Run `gh auth refresh -h github.com -s workflow`, then push `main`. Remote is `https://github.com/NicoHsu/planView.git`; SSH authentication failed, HTTPS repository access works.
- Public support/privacy page sources and the Pages workflow are prepared, but the website is not live until the push succeeds and GitHub Pages is enabled.

## Security follow-up

The remaining audit roots are `zod@3.25.76` (high, Expo CLI tooling) and `deepmerge@4.3.1` (low, Expo configuration tooling). npm also reports affected parent packages. These do not run in the Electron app or exported iOS runtime. Do not downgrade Expo to the obsolete version suggested by `npm audit fix --force`, or force a breaking Zod 4 override into CLI code expecting Zod 3. Recheck upstream fixes before production release; keep development servers on trusted networks and do not load untrusted configuration/extensions.

## Next commands

```bash
nvm use
cd apps/mobile
npx eas-cli login
npx eas-cli init
cd ../..
npm run ios:release:check
npm run ios:build:preview
```

After native QA passes, build production, capture screenshots and complete App Store Connect metadata. An exported JS bundle alone is not an App Store submission.
