# FocusedContext — Mobile

Most note-taking apps are graveyards for ideas. FocusedContext brings your notes back to life —
resurfacing them exactly when and where you need them, as a native mobile app.

This is the React Native (Expo) version of FocusedContext. The backend is identical to the web
version with minor cleanup. Only the frontend and notification delivery have changed.

**Web version:** https://github.com/shanikn/contextmind

## Overview

FocusedContext is a context-aware reminder system that uses semantic search and environmental
context to bridge the gap between "noting" and "doing." Write "buy milk" and it appears when
you're near a store. Write "study for exam" and it surfaces when you're at university.

The mobile version replaces the browser-based frontend with a React Native app and uses
local notifications (via expo-notifications) instead of Web Push.

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
| Mobile Frontend | React Native (Expo) + TypeScript |
| Location | expo-location |
| Notifications | expo-notifications + expo-task-manager (local) |
| Deployment | Docker, Docker Hub, Azure Web App for Containers |
| Testing | pytest (63+ tests, 93% coverage) |
| Linting | flake8 (pre-commit hook on every commit) |

## Running Locally On Your Phone

The mobile app can target either the deployed Azure API or a backend running on your own machine.
By default it uses Azure. To use a local backend instead:

1. In `mobile/`, create a `.env` file.
2. Set `EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:8000`
3. Start the backend so it listens on your network:
   `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload`
4. Start Expo from `mobile/`:
   `npm start`
5. Open the app on your phone through Expo Go while the phone and computer are on the same Wi-Fi.

Notes:
- Use your computer's LAN IP, not `localhost`.
- Example: `http://192.168.1.100:8000`
- If Windows Firewall prompts for access, allow it for private networks.
- The backend still needs its normal env/config for MongoDB and Firebase auth.
