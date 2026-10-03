# RSR Nexora V7 — Production Deployment Guide

## 1. Overview & Identity

- **Application / Product Name**: RSR Nexora
- **Studio / Developer**: RSR Studios
- **Package ID**: `com.rsr.nexora`
- **Release Version**: 7.0.0
- **Release Stage**: V7 Production Release

RSR Nexora is a production-hardened, high-performance conversational AI and data analysis platform featuring:
- Server-side Google Gemini API integration (no client exposure of API keys)
- 24ms frame-throttled token streaming via Server-Sent Events (SSE)
- Scrypt cryptographic password hashing with 16-byte random salts & constant-time verification
- 4-tier prompt defense hierarchy and untrusted data boundary isolation
- Isolated workspaces, transparent memories, document extraction, and structured JSON backup import/export
- WCAG AA accessibility, keyboard focus states, responsive layouts, and PWA installability

---

## 2. Environment Variables Configuration

Configure these environment variables in your secure server environment (e.g., Cloud Run environment secrets, Kubernetes Secrets, or `.env`):

| Variable Name | Required | Default / Example | Description |
|---|---|---|---|
| `PORT` | Required (Hardcoded) | `3000` | Container ingress port routed by reverse proxy. |
| `NODE_ENV` | Required | `production` | Runtime mode. Must be set to `production` in live environments. |
| `GEMINI_API_KEY` | Required | `AIzaSy...` (Secret) | Server-side Gemini API key. Never exposed to browser or client bundles. |
| `APP_URL` | Optional | `https://your-domain.com` | Primary canonical URL of the deployed application. |
| `ALLOWED_ORIGINS` | Optional | `https://your-domain.com` | Comma-separated list of allowed CORS origins or `*` for public previews. |
| `SESSION_SECRET` | Recommended | Random 64-char hex | Secret key for signing sessions and cryptographic tokens. |
| `RATE_LIMIT_WINDOW_MS` | Optional | `60000` | Sliding window in milliseconds for API rate limiters. |
| `PAYMENT_PROVIDER` | Optional | `razorpay` | Payment provider adapter (`razorpay`). |
| `PAYMENT_PUBLIC_KEY` | Optional | `rzp_test_...` | Public client identifier for Razorpay modal checkout. |
| `PAYMENT_SECRET_KEY` | Optional (Secret) | `rzp_secret_...` | Server-side private key for creating orders and signature verification. |
| `PAYMENT_WEBHOOK_SECRET` | Optional (Secret) | Random hex | Secret for HMAC-SHA256 verification of incoming webhook events. |
| `API_01_KEY` .. `API_10_KEY` | Optional | Provider keys | API keys for 10-slot automatic fallback orchestration. |
| `ADMIN_EMAIL` | Recommended | `rsrstudios.help@gmail.com` | Hardened admin email address. Server-side authoritative only. |
| `ADMIN_PASSWORD_HASH` | Recommended | `<salt>:<hash>` | Scrypt password hash (`<salt_hex>:<hash_hex>`). Never exposed to client. |

> **Security Rule**: `GEMINI_API_KEY`, `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`, and `ADMIN_PASSWORD_HASH` are loaded strictly on the Node.js server side. They are never bundled into frontend assets, returned in client responses, or committed to source control.

---

## 3. Server-Side Admin Password Hash Generation

To provision or update the RSR Nexora administrator password securely without exposing plaintext credentials to source control, frontend code, or shell history:

### Interactive Terminal Generation (Recommended)
Run the generator on your secure server or local terminal:
```bash
npm run admin:hash
```
1. You will be prompted to enter and confirm the admin password.
2. Input characters are hidden and will **not** be echoed to the console.
3. The generator outputs strictly the format:
```text
ADMIN_PASSWORD_HASH=<salt_hex>:<hash_hex>
```

### Stdin / Piped Generation (For Headless CI/CD / Secret Injection)
Pipe the password directly into the generator:
```bash
echo -n "YourStrongPassword#2026!" | npm run admin:hash -- --stdin
```

To output only the raw `<salt>:<hash>` string:
```bash
echo -n "YourStrongPassword#2026!" | npm run admin:hash -- --stdin --raw
```

### Applying the Hash
Add the output directly to your production secrets environment:
- In `.env`: `ADMIN_PASSWORD_HASH=19da6fe...:22ac5e2...`
- In Google Cloud Run: Add `ADMIN_PASSWORD_HASH` under **Cloud Run > Service > Edit & Deploy New Revision > Variables & Secrets**.
- **Important**: Never commit `.env` or the generated hash to GitHub.

---

## 4. Build & Runtime Execution

### Prerequisites
- Node.js 18+ (tested on Node.js 20/22)
- npm 9+

### Build Command
```bash
npm run build
```
This executes:
1. `vite build` — minifies frontend assets, performs code-splitting across dynamic modal dialogs, compiles Tailwind CSS, and outputs to `dist/`.
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` — bundles the Node/Express backend into a standalone CommonJS entry point.

### Start Command (Production)
```bash
npm start
```
Executes `node dist/server.cjs`, launching the production server on `0.0.0.0:3000` with static asset serving and SPA history fallback.

### Verification Commands
```bash
npm run lint   # Runs tsc --noEmit
npm test       # Executes all 111 automated unit, integration, and E2E tests across 18 suites
```

---

## 4. Health & Readiness Endpoints

- **Live Status Probe**: `GET /api/health`
  - Returns HTTP 200 with application status, version, capabilities, environment, and security posture.
  - Safe for public monitoring; credentials and internal secrets are completely excluded.
- **Readiness Probe**: `GET /api/health/ready`
  - Returns HTTP 200 `{"status":"ready","app":"RSR Nexora","ready":true}` when the backend is primed to handle traffic.

---

## 5. Security & Network Posture

1. **HTTPS & HSTS Requirement**: In production, traffic must terminate on an HTTPS listener. Secure cookie flags and strict origins are active.
2. **Security Headers**:
   - `Content-Security-Policy`: Restricts scripts, styles, fonts, frames, and connect endpoints.
   - `X-Content-Type-Options: nosniff`: Prevents MIME type sniffing.
   - `X-Frame-Options: SAMEORIGIN`: Restricts embedding to same-origin and AI Studio preview containers.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `X-Powered-By`: Explicitly suppressed.
3. **Rate Limiting**: Multi-tiered token bucket rate limiting applied to `/api/auth`, `/api/chat`, `/api/files`, and general endpoints.
4. **Input Sanitization**: Path traversal sequences (`../`, null bytes, control codes) and dangerous file extensions (`.exe`, `.sh`, `.bat`, etc.) are rejected at ingress.
5. **Prompt Defense**: 4-tier prompt defense hierarchy protects against prompt injection by tagging user data, files, and web results into isolated untrusted boundaries.

---

## 6. Database & Persistence Architecture

- **Current V7 Architecture**: Uses high-performance in-memory repositories with secondary indices (`userWorkspacesIndex`, `userConversationsIndex`, `userMemoriesIndex`) and client-side debounced `localStorage` synchronization.
- **Backup & Restore**: Users can export full JSON archives of conversations, workspaces, and memories via `GET /api/backup/export` and restore them via `POST /api/backup/import`.
- **Horizontal Scaling Roadmap**: For multi-instance horizontal scaling across multiple container replicas with distributed persistence, the database interface (`server/db/database.ts`) should be connected to a managed external store (such as Cloud SQL PostgreSQL or Firebase Firestore) using transaction locks and connection pooling.

---

## 7. Advanced Subsystems & Operational Notes

- **Subscription & Payment System**: Complete server-authoritative tiers (Nexora Free, Plus, Pro, Ultra). Enforces cryptographic HMAC-SHA256 webhook signatures, idempotency, server-enforced pricing, and automatic quota alignment. When live payment gateway credentials (`PAYMENT_PUBLIC_KEY`, `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`) are unconfigured, paid checkout is safely disabled with informative notices instead of mock transactions.
- **10-Slot Automatic Fallback Orchestration**: High-availability AI fallback routing through priority-ordered slots (`API_01` to `API_10`) with transient 5xx/429 circuit breakers, cooldown tracking, and strict daily quota preservation regardless of which provider handles the request.
- **Horizontal Scaling**: In single-instance container deployments, repository state uses fast in-memory structures with disk snapshots and client-side persistence. For multi-replica horizontal clustering, connect `server/db/database.ts` to managed Cloud SQL PostgreSQL or Firebase Firestore.
