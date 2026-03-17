# FocusedContext

Most note-taking apps are graveyards for ideas. FocusedContext brings your notes back to life — resurfacing them exactly when and where you need them.

**Live demo:** https://contextmind-api-hngzd9ewbzg5cxhm.israelcentral-01.azurewebsites.net/frontend/index.html

## Overview

FocusedContext is a context-aware reminder system that uses semantic search and environmental context to bridge the gap between "noting" and "doing." Write "buy milk" and it appears when you're near a store. Write "study for exam" and it surfaces when you're at university.

## Key Features

- **Semantic Ingestion**: Uses `all-MiniLM-L6-v2` to understand note meaning, not just keywords
- **Auto-Categorization**: Tags notes as tasks, errands, ideas, reminders, or scheduled based on content
- **Re-Categorization on Edit**: Editing a note's content automatically re-infers category, location, and reminder time — so changing "remind me at 14:00" to "remind me at 13:00" updates the reminder accordingly, and the semantic embedding is updated too
- **Multi-Agent Pipeline**: Five specialized agents (`ingestion`, `categorizer`, `context`, `relevance`, `ranking_policy`) coordinated by a pipeline orchestrator
- **Context-Aware Ranking**: Combines semantic similarity with location (+3) and time (+2) bonuses
- **Feedback Loop**: "Useful" boosts rank, "Later" applies 24h cooldown, "Annoying" applies 7-day cooldown
- **Editable Metadata**: Users can manually override category, location, and time via custom dropdowns
- **Date Scheduling**: Set a specific date for each note — only surfaces on that day
- **Startup Re-Ingestion**: All notes are re-ingested into ChromaDB on server startup to ensure consistency
- **Firebase Auth**: Google Sign-In for user accounts
- **Browser Notifications**: Background notifier checks every 5 minutes, detects Wi-Fi SSID for automatic location

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.11) |
| Auth | Firebase Auth (Google Sign-In) |
| Primary Storage | MongoDB Atlas |
| Vector Store | ChromaDB (384-dim embeddings) |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`, local) |
| Frontend | Vanilla JS + HTML/CSS (single-page app) |
| Deployment | Docker, Docker Hub, Azure Web App for Containers |
| Custom Domain | focusedcontext.tech (.tech via GitHub Student Pack) |
| Testing | pytest (63+ tests, 93% coverage) |
| Linting | flake8 (pre-commit hook on every commit) |

## Architecture

```
User writes note
  -> notepad.py saves to MongoDB
  -> ingestion agent embeds text + stores vector in ChromaDB
  -> categorizer agent infers category, location, and time
  -> pipeline orchestrator coordinates the full flow

User requests reminders (location + time)
  -> relevance agent queries ChromaDB (semantic search)
  -> ranking_policy scores results (feedback history + context bonuses)
  -> top 3 notes returned

User gives feedback
  -> ranking_policy updates scores and cooldowns
```

## Setup

```bash
git clone https://github.com/shanikn/contextmind.git
cd contextmind
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
echo "MONGO_URI=your_connection_string" > .env
uvicorn api.main:app --reload
```

Or with Docker:

```bash
docker-compose up --build
```

## Tests

```bash
pytest tests/ -v
```

63+ unit tests (93% coverage) covering all agents: CRUD, categorization, time/location inference, embeddings, semantic search, synonym retrieval, ranking, feedback, notification queue, metadata override, and full pipeline orchestration. flake8 runs automatically on every commit via pre-commit hook.
