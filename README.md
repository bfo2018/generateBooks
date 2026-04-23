# BookForge AI

Lean full-stack web app for generating structured, editable books, research papers, and topic notes with user accounts and export support.

## Stack

- Frontend: plain HTML, CSS, and JavaScript
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- AI integration: configurable chat-completions style provider, defaulting to mock mode

## Features

- Registration, login, logout, and editable customer profile
- Customer-owned document history with per-user project lists
- Topic, description, document type, language, paper size, and image options
- AI generation route kept on the server
- Editable content workspace
- MongoDB-backed project persistence
- Demo-safe in-memory storage fallback for local sandboxed runs
- Download as `.docx` or `.pdf`
- Configurable AI provider settings for DeepSeek or similar OpenAI-compatible APIs
- 3-page locked preview before full access
- Token-based pricing with 10-day free trial, configurable platform fee, and color-image surcharge
- Razorpay payment gateway support with configurable key and secret
- Full-screen generation loader for long-running generation requests

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

- Set `API_BASE_URL` only when your frontend should call a separate backend domain. Example: `https://your-api.example.com`
- Set `CORS_ORIGIN` on the backend when you want to allow only specific frontend domains. You can provide one origin or multiple comma-separated origins, and wildcard entries such as `https://*.ngrok-free.dev` are supported. If left empty, the server allows any requesting origin, which is useful for local and ngrok testing.
- Set `MONGODB_URI` to your MongoDB connection string
- Leave `STORAGE_MODE=mongo` for normal use, or switch to `STORAGE_MODE=memory` for a quick local demo without MongoDB
- Set `AI_PROVIDER=mock` for local testing without an API
- Or set `AI_PROVIDER=deepseek` and configure:
  - `AI_API_URL`
  - `AI_API_KEY`
  - `AI_MODEL`
- Configure payment and pricing:
  - `PAYMENT_MODE=demo` for local testing or `PAYMENT_MODE=razorpay` for live checkout
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `PLATFORM_FEE_INR`
  - `FREE_TRIAL_DAYS`
  - `COLOR_IMAGE_CHARGE_INR`
  - `INPUT_COST_PER_1K_TOKENS_INR`
  - `OUTPUT_COST_PER_1K_TOKENS_INR`
  - `PREVIEW_PAGE_LIMIT`
  - `WORDS_PER_PREVIEW_PAGE`

4. Start the server:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Notes

- The frontend never sees your API key.
- `API_BASE_URL` lets the browser app call a separately deployed backend instead of the same origin.
- `CORS_ORIGIN` is optional for development. When set, it acts as an allowlist for browser origins. Exact domains and wildcard patterns such as `https://*.ngrok-free.dev` are supported. When empty, the server reflects the requesting origin so cross-origin API calls still work during local/ngrok testing.
- To verify preflight behavior, run `curl -X OPTIONS '<your-api-url>/api/auth/login' -i -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'` and confirm the response includes `Access-Control-Allow-Origin`.
- Razorpay checkout only needs the public key on the client; signature verification stays on the server with `RAZORPAY_KEY_SECRET`.
- Export downloads can use short-lived signed URLs so PDF/DOCX buttons work reliably even when the frontend and API are on different domains. Configure `EXPORT_SIGNING_SECRET` in production and adjust `EXPORT_URL_TTL_SECONDS` if you want shorter or longer link lifetimes.
- The AI integration is intentionally configurable because provider availability and endpoints can change.
- `mock` mode generates a structured sample draft so the app remains usable before API setup.
- Pricing is calculated from AI token usage when the provider returns usage stats, or estimated from prompt/output length as a fallback.
- Platform fee is `Rs 0` during a user's first `FREE_TRIAL_DAYS`, then switches to the configured fee.
- Color file generation with image/figure suggestions adds the configured surcharge.
