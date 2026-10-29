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
- GitHub CI passed: https://github.com/NicoHsu/planView/actions/runs/40863961381
- GitHub Pages deployment passed: https://github.com/NicoHsu/planView/actions/runs/40864050633
- Public home, support, privacy and stylesheet return HTTP 200: https://nicohsu.github.io/planView/
- EAS iOS simulator native build finished successfully: https://expo.dev/accounts/nicohsu/projects/planview/builds/92ed130c-4f1e-47e1-9248-3eea289be3a2

## External gates

- Expo login verified and EAS project linked: https://expo.dev/accounts/nicohsu/projects/planview (project ID `8c75ead5-a8eb-47ef-bf31-fb872eb9d723`).
- The owner confirmed there is no paid Apple Developer membership. TestFlight / App Store distribution cannot proceed until membership is available. A simulator build profile is provided and does not require paid membership.
- App Store Connect app record, signing and provisioning are not configured.
- This Mac has Command Line Tools only, without Xcode / `simctl`; native compilation passed on EAS, but iOS simulator execution and physical-device QA have not run locally.
- Complete the [TestFlight device matrix](store/TESTFLIGHT_QA.md), including notifications, lock screen, force quit, reboot, time changes, VoiceOver and large text.
- Capture real iPhone/iPad screenshots from the verified native build. No mock screenshot is represented as a device capture.
- Desktop installers are unsigned until Developer ID / Windows code signing is configured.

## Deliverables

`dist/release-manifest.json` and `dist/SHA256SUMS` list the verified desktop artifacts and downloaded iOS simulator archive. Desktop files are unsigned test builds. The iOS simulator archive cannot be installed on a physical iPhone.

Source repository: https://github.com/NicoHsu/planView (HTTPS push configured; SSH authentication is unavailable on this machine).

## Security follow-up

The remaining audit roots are `zod@3.25.76` (high, Expo CLI tooling) and `deepmerge@4.3.1` (low, Expo configuration tooling). npm also reports affected parent packages. These do not run in the Electron app or exported iOS runtime. Do not downgrade Expo to the obsolete version suggested by `npm audit fix --force`, or force a breaking Zod 4 override into CLI code expecting Zod 3. Recheck upstream fixes before production release; keep development servers on trusted networks and do not load untrusted configuration/extensions.

## Next commands

```bash
nvm use
cd apps/mobile
cd ../..
npm run ios:release:check
npm run ios:build:simulator
```

After installing full Xcode, the simulator artifact can be installed with `npx eas-cli build:run --platform ios --latest`. It cannot be installed directly on an iPhone. Once paid Apple Developer membership is available and native device QA passes, build production, capture screenshots and complete App Store Connect metadata. An exported JS bundle alone is not an App Store submission.
