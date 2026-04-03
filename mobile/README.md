# GameStreamer Mobile

Expo (React Native) app for iOS and Android. Shares the same Vercel API and Supabase backend as the web app.

## Quick start

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_API_URL to your Vercel deployment URL

npx expo start
```

Press `i` to open in iOS Simulator, `a` for Android emulator, or scan the QR code with the Expo Go app on your phone.

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Home | `/` | Navigation hub |
| Scorer | `/scorer` | Create a game and enter plays |
| Viewer | `/viewer?game=ID` | Watch with live scorebug + video |
| Streamer | `/streamer` | Instructions + link a stream URL |
| Box Score | `/boxscore?game=ID` | Full line score + play-by-play |

## Building for App Store / Google Play

```bash
npm install -g eas-cli
eas login
eas build:configure

# iOS
eas build --platform ios

# Android
eas build --platform android
```

See [Expo EAS Build docs](https://docs.expo.dev/build/introduction/) for full details.

## Project structure

```
mobile/
  app/              Expo Router screens
  components/       Shared UI (Diamond, CountDots)
  hooks/            useGameState polling hook
  lib/              api.ts, colors.ts
```
