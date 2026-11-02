# AI Studio — Setup and Configuration Guide

## 1. Project Overview

Verify that the core files exist at project root:
- `package.json`
- `server.ts`
- `src/App.tsx`
- `src/lib/firebase.ts`
- `src/components/PhoneVerificationField.tsx`
- `.env.example`

Preserve the existing codebase and configuration. Do not replace or overwrite the project with older export snapshots.

## 2. Dependencies

```bash
npm install
```

## 3. Firebase Environment

### Client Web App
Set the values from **Firebase Console -> Project settings -> General -> Your apps -> Web app** in `.env` / environment variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID=relationship-id`

### Server Firebase Admin Credentials
The Express backend requires server-side Application Default Credentials (ADC) to access Firestore `(default)` on project `relationship-id`.
- Supported Google Cloud runtimes (e.g. Cloud Run) provide credentials automatically via attached service accounts.
- Local/preview environments require an explicitly configured credential mechanism (e.g. `GOOGLE_APPLICATION_CREDENTIALS` or `gcloud auth application-default login`).
- **Security Rule**: Never place service account secrets in client variables, source files, or chat. Missing credentials require external environment configuration; backend code cannot manufacture access.

## 4. Firebase Authentication

Enable in Firebase Console:
- Email/Password
- Google

The app does not use Apple sign-in or Firebase SMS Phone Auth. WhatsApp verification is performed server-side via Twilio Verify.

## 5. Google Sign-In Verification

If the embedded preview blocks the popup, open preview in a new tab. If Firebase shows `auth/unauthorized-domain`, add that exact preview hostname in **Firebase Authentication -> Settings -> Authorized domains**.

## 6. WhatsApp Verification via Twilio Verify

The application performs phone/WhatsApp verification through two backend endpoints:
- `POST /api/whatsapp/verify/start`: Initiates a verification challenge by sending a one-time code to the canonical E.164 number via WhatsApp using Twilio Verify.
- `POST /api/whatsapp/verify/check`: Validates the submitted code against Twilio Verify and sets `phoneVerified: true` and `whatsappTrusted: true`.
- If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_VERIFY_SID` are unconfigured, these endpoints fail closed with HTTP 503 (`WHATSAPP_VERIFY_UNAVAILABLE`).

## 7. App Check Protection

All protected `/api/*` endpoints require a valid `X-Firebase-AppCheck` token. Only `GET /api/health` and the exact `POST /api/reminders/process` scheduler endpoint are exempt from browser App Check.

## 7.1 Reminder Scheduler Configuration

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

## 8. Verification Commands

```bash
npm run typecheck
npm run test:unit
npm run build
```

## 9. Backend Storage & Health Readiness
 
The backend uses durable Firebase Admin Firestore (`adminDb`) for persistent storage.
The `/api/health` readiness route performs a bounded read-only probe:
- **HTTP 200** (`status: "ok"`, `firestoreReachable: true`) indicates live database reachability.
- **HTTP 503** (`status: "unavailable"`, `firestoreReachable: false`) indicates initialization failure, missing ADC credentials, timeout, or database unreachability.
- No internal errors, tokens, or private data are leaked in health responses.

## 10. Environment Variables Reference

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



## 11. Historical Data Reconciliation Prerequisite (Controlled Backfill Plan)

**Coverage Status**: **NOT VERIFIED** (Mandatory Pre-Release Deployment Prerequisite).

Existing active records created before atomic reservation and public contact index enforcement do not automatically possess entries in `contact_reservations` or `public_contact_index`. Until backfilled:
- Old relationships will not be discoverable via exact contact search (`/api/verify/contact`).
- Unreserved contacts from old relationships are vulnerable to conflicting re-reservation.

### Controlled Backfill Plan (Do NOT execute without production authorization):
1. **Batch Ingestion**: Query active relationships (`status == 'active'`) in bounded batches (e.g. 50 records).
2. **Canonical Normalization**: Normalize all P1 and P2 emails (trim/lowercase) and mobile/WhatsApp numbers (E.164 via `normalizeCanonicalPhone`) using `src/utils/contacts.ts`.
3. **Collision Detection & Version Preconditions**:
   - For each extracted contact hash, read `contact_reservations/{hash}`.
   - If a reservation already exists and belongs to a different active relationship, flag for manual audit/support review. **Never overwrite conflicting reservations.**
4. **Atomic Reservation Writing**:
   - Write `contact_reservations/{hash}` with `{ recordId, contactHash, updatedAt }`.
5. **Conditional Public Index Publishing**:
   - Check relationship settings: if BOTH `settings.publicContactSearchP1 === true` AND `settings.publicContactSearchP2 === true`:
     - Map `record.type` to canonical stage (`Married`, `Engaged`, `Dating`).
     - Write `public_contact_index/{hash}` with `{ recordId, contactHash, stage, updatedAt }`.
   - If either consent flag is missing or false (default), skip writing `public_contact_index`.
6. **Execution Safety**:
   - Run in dry-run/audit mode first to log all proposed writes and collisions before committing mutations.

