# iOS Build Runbook

## Local Checks

Use Node.js 24 (`nvm use` from the repository root). The project uses Expo SDK 58.

Run before every TestFlight build:

```bash
npm run ios:release:check
npm --workspace apps/mobile run doctor
```

Expected:

- Core tests pass.
- Expo config resolves.
- iOS bundle export succeeds.
- Expo doctor reports all checks passed.

## EAS Login

`npm run test:e2e` additionally exercises the Electron desktop workflow with isolated temporary data.

Interactive login:

```bash
npx eas-cli login
```

CI or non-interactive login:

```bash
export EXPO_TOKEN=your_token
```

Create an Expo token in Expo account settings.

## Preview Build

Use for internal testing:

```bash
npm run ios:build:preview
```

## Production Build

Use for App Store submission:

```bash
npm run ios:build:production
```

## Submit To App Store Connect

After the production build is complete:

```bash
npm --workspace apps/mobile run submit:ios
```

## Current Blocker

The local EAS preview command reaches the expected account gate:

```text
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable.
```

On 2026-10-29, `eas whoami` confirmed `Not logged in`. Run `npx eas-cli login`, then `npx eas-cli init` from `apps/mobile` to link an EAS project. Do not invent a project ID. Local JavaScript export does not require this login.

The local machine has only Xcode Command Line Tools; `xcrun simctl` is unavailable. Use EAS Build or install the full compatible Xcode toolchain for native builds.

## Apple Developer Requirements

Before production submission, prepare:

- Apple Developer Program membership.
- App Store Connect app record for bundle id `com.planview.focusplanner`.
- Public Privacy Policy URL.
- Public Support URL.
- App icon and screenshots.
- TestFlight QA pass.
