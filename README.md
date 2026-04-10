# BookForge AI

Lean full-stack web app for generating structured, editable book drafts and exporting them as DOCX or PDF.

## Stack

- Frontend: plain HTML, CSS, and JavaScript
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- AI integration: configurable chat-completions style provider, defaulting to mock mode

## Features

- Topic, description, and book type input
- AI generation route kept on the server
- Editable content workspace
- MongoDB-backed project persistence
- Demo-safe in-memory storage fallback for local sandboxed runs
- Download as `.docx` or `.pdf`
- Configurable AI provider settings for DeepSeek or similar OpenAI-compatible APIs

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy environment settings:

```bash
cp .env.example .env
```

3. Update `.env`:

- Set `MONGODB_URI` to your MongoDB connection string
- Leave `STORAGE_MODE=mongo` for normal use, or switch to `STORAGE_MODE=memory` for a quick local demo without MongoDB
- Set `AI_PROVIDER=mock` for local testing without an API
- Or set `AI_PROVIDER=deepseek` and configure:
  - `AI_API_URL`
  - `AI_API_KEY`
  - `AI_MODEL`

4. Start the server:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Notes

- The frontend never sees your API key.
- The AI integration is intentionally configurable because provider availability and endpoints can change.
- `mock` mode generates a structured sample draft so the app remains usable before API setup.
