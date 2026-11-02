# Relationship ID — AI Studio Test Build

This project is prepared for the **new** Relationship ID Google AI Studio / Firebase environment.

## What is implemented

- React + Vite + TypeScript UI based on the latest uploaded project.
- Firebase Email/Password authentication.
- Firebase Google sign-in with popup and redirect fallback.
- WhatsApp verification powered by Twilio Verify (`/api/whatsapp/verify/start` and `/api/whatsapp/verify/check`).
- Country code before mobile number and E.164 normalization.
- WhatsApp trust rule: same as verified mobile is trusted; a different WhatsApp stays unverified until confirmed via Twilio WhatsApp verification.
- P1 relationship stage + required relationship start date.
- P1 partner information and secure invitation links.
- P2 invitation -> authentication -> own profile -> real WhatsApp verification -> accept/decline.
- Certificate created only after backend acceptance.
- Real QR code pointing to the privacy-safe public verification route.
- Public verification exposes names, stage, start date and status only.
- No payments, no Apple sign-in, no AI coach, no automatic deployment.

## Backend Architecture and Server Credentials

The backend uses durable Firestore persistence via the Firebase Admin SDK (`adminDb`), connecting to database `(default)` under project `relationship-id`. The server does NOT use an in-memory or fake data store.

### Frontend Web vs. Backend Admin Credentials
- **Client Web App (`VITE_FIREBASE_*`)**: The browser React app uses client configuration exclusively for client-side Firebase Authentication (Email/Password, Google Sign-In) and App Check. Client keys never have Admin database privileges.
- **Server Firebase Admin (`adminDb` / `adminAuth`)**: The Express backend requires server-side Application Default Credentials (ADC) to verify tokens and perform Firestore operations.
- **Google-Hosted Runtimes**: In supported Google Cloud environments (such as Cloud Run or Compute Engine), credentials are provided automatically via the attached service account identity. Do not assume AI Studio preview environments automatically provide backend ADC credentials.
- **Local / Preview Development**: Local execution requires an explicitly configured, supported credential mechanism (e.g. `GOOGLE_APPLICATION_CREDENTIALS` pointing to a local service account key file, or active credentials via `gcloud auth application-default login`).
- **Security Invariant**: Never place service-account secrets or private keys in frontend variables, repository source files, or chat.
- **Access Boundary**: Missing server credentials or IAM permissions require external environment setup; backend code cannot manufacture credentials or bypass GCP IAM.

### Backend Readiness (`/api/health`)
The `/api/health` route tests live Firestore reachability via a bounded read-only probe:
- Returns **HTTP 200** with `status: "ok"` and `firestoreReachable: true` only when the Firestore probe succeeds.
- Returns **HTTP 503** with `status: "unavailable"` and `firestoreReachable: false` when initialization, credentials, or Firestore reachability fail.
- All internal error details, tokens, and stack traces are strictly stripped from readiness responses.

### Environment Configuration Reference

| Variable Name | Purpose | Scope & Requirement | Expected Format | Secret / Public | Absent Behavior / Fallback | Configuration Location |
| --- | --- | --- | --- | --- | --- | --- |
| `CONTACT_HASH_SECRET` | HMAC-SHA256 salt for contact hashing, reservation, uniqueness, and blocking. **Must remain stable**; changing/rotating breaks existing stored hashes and reservations. | **Required at Startup** (fail-closed if missing or < 32 chars) | Random string (>= 32 chars) | **Server-Only Secret** | Server throws a fatal startup error and refuses to start | Environment / Secret Manager |
| `FIREBASE_PROJECT_ID` | Firestore project identifier for server-side Firebase Admin initialization | **Production Recommended** (non-blocking warning) | String project ID | Public Config / Server | Falls back to `VITE_FIREBASE_PROJECT_ID`. In production, logs warning on startup. If unresolvable and Admin fails to initialize, `SERVER_FIREBASE_PROJECT_ID_MISSING` (500) is returned only on protected routes. | Environment / `.env` |
| `RECONCILE_SECRET` | Shared secret for Cloud Scheduler deletion reconciliation (`POST /internal/reconcile`) | **Production Recommended** (min 32 chars) | Random string (>= 32 chars) | **Server-Only Secret** | `POST /internal/reconcile` returns 404 (`NOT_FOUND`). In production, logs warning on startup. | Environment / Secret Manager |
| `REMINDER_SCHEDULER_SECRET` | Shared secret for background reminder processor (`POST /api/reminders/process`). Header-only (`x-reminder-scheduler-secret` or alias `x-scheduler-secret`). | Feature-Specific (Reminders, min 32 chars) | Random string (>= 32 chars) | **Server-Only Secret** | `POST /api/reminders/process` returns 403 (`UNAUTHORIZED`). Query credentials are not accepted. | Environment / Secret Manager |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID for WhatsApp verification (`/api/whatsapp/verify/*`) | Feature-Specific (Twilio Verify) | SID string (`AC...`) | **Server-Only Secret** | WhatsApp verification returns 503 (`WHATSAPP_VERIFY_UNAVAILABLE`) | Environment / Secret Manager |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token for WhatsApp verification | Feature-Specific (Twilio Verify) | Hex/string token | **Server-Only Secret** | WhatsApp verification returns 503 (`WHATSAPP_VERIFY_UNAVAILABLE`) | Environment / Secret Manager |
| `TWILIO_VERIFY_SID` | Twilio Verify Service SID (`VA...`) | Feature-Specific (Twilio Verify) | Service SID (`VA...`) | **Server-Only Secret** | WhatsApp verification returns 503 (`WHATSAPP_VERIFY_UNAVAILABLE`) | Environment / Secret Manager |
| `RESEND_API_KEY` | Resend API key for outbound reminder emails | Feature-Specific (Email Reminders) | API key string (`re_...`) | **Server-Only Secret** | Email reminders fail closed / unconfigured (no sends) | Environment / Secret Manager |
| `EMAIL_FROM` | Sender address for reminder emails | Feature-Specific (Email Reminders) | Email address | Public Config | Falls back to `reminders@relationshipid.org` | Environment / `.env` |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | Feature-Specific (Push Reminders) | Base64 public key | Public Config | Push notifications unconfigured | Environment / `.env` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | Feature-Specific (Push Reminders) | Base64 private key | **Server-Only Secret** | Push notifications unconfigured | Environment / Secret Manager |
| `VAPID_SUBJECT` | Web Push VAPID contact URI | Feature-Specific (Push Reminders) | URI string (`mailto:...`) | Public Config | Falls back to `mailto:support@relationshipid.org` | Environment / `.env` |

### Automatic Deletion Reconciliation
Deletion cleanup is triggered by Google Cloud Scheduler calling `POST /internal/reconcile` with header `X-Reconcile-Secret` (minimum 32 characters, constant-time SHA-256 comparison). The in-process timer acts as a local fallback.

## Reminder Scheduler Configuration

### 1. Recommended Schedule
- **Cron Expression**: `*/5 * * * *` (invokes the reminder processor every 5 minutes).

### 2. Processing Endpoint
- **Request**: `POST /api/reminders/process`

### 3. Authentication & Secret Handling
- **Headers**: Requires header authentication using `x-reminder-scheduler-secret` containing the configured `REMINDER_SCHEDULER_SECRET` value (or alias header `x-scheduler-secret`).
- **Header Rules**: Supply only one supported header per request. Query-string credentials (`?secret=...`) are not accepted and return HTTP 403 (`UNAUTHORIZED`).
- **Secret Length**: The secret must be at least 32 characters long. Never display real secrets in documentation or logs.

### 4. Processing Timing & Attempt Rules
- **Time Window**: Checks each user's validated IANA timezone and dispatches reminders strictly during their local 09:00 hour.
- **Backoff Enforcement**: The 5-minute scheduler polling does not alter the application's enforced 15-minute minimum retry backoff (`REMINDER_RETRY_BACKOFF_MS = 15 minutes`).
- **Attempt Limit**: Maximum of 3 TOTAL attempts per local occurrence/channel (`REMINDER_MAX_ATTEMPTS = 3`), not an initial attempt plus 3 retries.
- **Polling Dynamics**: Five-minute polling provides more opportunities to retry after the 15-minute backoff expires within the local 09:00 hour window. It does not guarantee three attempts or successful delivery during outages, extended execution, or scheduler delays.

### 5. Delivery Safeguards & Limits
- **Deduplication**: Successful occurrences are permanently recorded and not intentionally resent.
- **Permanent Rejections**: Confirmed permanent failures (e.g. 4xx client rejections, invalid recipients) are not automatically retried.
- **Email Retries**: Email retries require an unchanged request fingerprint (SHA-256 hash of sender, recipient, subject, and text) within the safe 23-hour retention window.
- **Push Safeguards**: Uncertain push outcomes and abandoned push claims are not automatically replayed to prevent duplicate notifications.
- **Delivery Guarantees**: Provider acceptance does not prove end-user device delivery or reading. Exactly-once delivery is not claimed.

### 6. Runtime Setup & Operational Notes
- **Manual Configuration Instructions**: These instructions describe manual runtime setup and do not imply an active live scheduler is running.
- **Secret Sync**: The deployed server environment and Cloud Scheduler job must be configured with the same secret. Saving a secret in AI Studio alone does not verify deployed runtime configuration. Do not rotate or replace existing working secrets.
- **Operating Costs**: An active scheduler incurs cloud execution and third-party messaging provider costs; the five-minute schedule is not free.

## AI Studio Setup

1. Open your Relationship ID application in Google AI Studio.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure Firebase Web App variables in `.env` / environment:

   ```text
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_STORAGE_BUCKET
   VITE_FIREBASE_MESSAGING_SENDER_ID
   VITE_FIREBASE_APP_ID
   FIREBASE_PROJECT_ID=relationship-id
   ```

4. In the Firebase project, enable Authentication providers:
   - Email/Password
   - Google
   (Note: Phone verification is conducted via server-side Twilio WhatsApp endpoints, not Firebase SMS Auth).
5. If Firebase reports `auth/unauthorized-domain`, add the AI Studio preview hostname in **Firebase Authentication -> Settings -> Authorized domains**.
6. Ensure App Check is configured with reCAPTCHA Enterprise/v3 token provider.
7. Start the dev server:

   ```bash
   npm run dev
   ```

## Required Verification Checks

Run after changes:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Do not consider a check passing unless it completes with a clean 0 exit code.

## WhatsApp Verification Flow

1. User requests a verification code via `POST /api/whatsapp/verify/start`.
2. Backend validates country and canonical phone number format (E.164), checks active relationship conflicts, and invokes Twilio Verify over WhatsApp.
3. User submits received code via `POST /api/whatsapp/verify/check`.
4. Backend verifies code against Twilio, and on success, updates user profile with `phoneVerified: true` and `whatsappTrusted: true`.
5. If Twilio credentials are not configured, both endpoints fail closed with HTTP 503 (`WHATSAPP_VERIFY_UNAVAILABLE`).

## Deployment

**DO NOT DEPLOY AUTOMATICALLY.** Deployment must be explicitly authorized. Ensure all tests and build checks pass cleanly before release.
