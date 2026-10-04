# Smart Mind — Android

Most note-taking apps are graveyards for ideas. Smart Mind brings your notes back to life —
resurfacing them exactly when and where you need them, as a native Android app.

The app is built with React Native and Expo (SDK 54) in `mobile/`, backed by a FastAPI server
in `api/`.

## Overview

Smart Mind is a context-aware reminder system that uses semantic search and environmental
context to bridge the gap between "noting" and "doing." Write "buy milk" and it appears when
you're near a store. Write "study for exam" and it surfaces when you're at university.

The Android app talks to the FastAPI backend and uses local notifications
(via expo-notifications) to deliver reminders.

## Key Features

- **Semantic Ingestion**: Uses `all-MiniLM-L6-v2` to understand note meaning, not just keywords
- **Auto-Categorization**: Tags notes as tasks, errands, ideas, reminders, or scheduled
- **Re-Categorization on Edit**: Editing a note triggers re-inference of category, location,
  and time — embedding is updated too
- **Multi-Agent Pipeline**: Five specialized agents (`ingestion`, `categorizer`, `context`,
  `relevance`, `ranking_policy`) coordinated by a pipeline orchestrator
- **Context-Aware Ranking**: Combines semantic similarity with location (+3) and time (+2) bonuses
- **Feedback Loop**: "Useful" boosts rank, "Later" applies 24h cooldown, "Annoying" 7-day cooldown
- **Local Push Notifications**: Background task checks reminders every ~15 min, shows native
  notifications via expo-notifications (no FCM server needed)
- **GPS Location Detection**: Uses phone GPS to auto-detect which saved location the user is near
- **Firebase Auth**: Google Sign-In for user accounts
- **Date Scheduling**: Set a specific date for each note — only surfaces on that day

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.11) |
| Auth | Firebase Auth (Google Sign-In) |
| Primary Storage | MongoDB Atlas |
| Vector Store | ChromaDB (384-dim embeddings) |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`, local) |
| Android App | React Native (Expo SDK 54) + TypeScript |
| Location | expo-location |
| Notifications | expo-notifications + expo-task-manager (local) |
| Deployment | Docker, Docker Hub, Azure Web App for Containers |
| Testing | pytest (121 tests) |
| Linting | flake8 (pre-commit hook on every commit) |

## Running On Android

### Prerequisites

1. Install [Android Studio](https://developer.android.com/studio) and, from its SDK Manager,
   the Android SDK and platform tools.
2. Create and start an emulator (Device Manager), or connect an Android phone with USB debugging enabled.
3. Set `ANDROID_HOME` to your Android SDK path (on Windows usually
   `%LOCALAPPDATA%\Android\Sdk`) and add `%ANDROID_HOME%\platform-tools` to your `PATH`.

### Build and run

```bash
cd mobile
npm install
npx expo run:android
```

This builds the native Android project and installs the app on the running emulator or connected device.

### Using a local backend

By default the app uses the deployed Azure API. To use a backend running on your own machine instead:

1. In `mobile/`, create a `.env` file.
2. Set `EXPO_PUBLIC_API_BASE_URL` to your backend's address:
   - Emulator: `http://10.0.2.2:8000` (the emulator's alias for your computer)
   - Physical device: `http://YOUR_COMPUTER_LAN_IP:8000`, e.g. `http://192.168.1.100:8000`
3. Start the backend so it listens on your network:
   `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload`
4. Rebuild/restart the app with `npx expo run:android` from `mobile/`.

Notes:
- Don't use `localhost` — on Android it refers to the device itself.
- On a physical device, the phone and computer must be on the same Wi-Fi.
- If Windows Firewall prompts for access, allow it for private networks.
- The backend still needs its normal env/config for MongoDB and Firebase auth.
