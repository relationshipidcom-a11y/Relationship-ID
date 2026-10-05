# AI Studio — exact next steps

## 1. Upload this project

Use this ZIP as one complete project. Do not merge it with the previous Relationship ID source.

After the files are in AI Studio, verify these exist at project root:

- `package.json`
- `server.ts`
- `src/App.tsx`
- `src/lib/firebase.ts`
- `src/components/PhoneVerificationField.tsx`
- `.env.example`

## 2. Install

```bash
npm install
```

## 3. Firebase environment

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

Enable:

- Email/Password
- Google
- Phone

The app does not use Apple sign-in or phone-only login.

## 5. Test Google sign-in

If the embedded preview blocks the popup, use Open in new tab. If Firebase shows `auth/unauthorized-domain`, add that exact preview hostname in Firebase Authentication authorized domains.

## 6. Test phone OTP

Use a real mobile number you control. The app sends the E.164 canonical number to Firebase. The country code is selected separately from the national mobile number (e.g. Saudi local numbers like `055...` are correctly normalized using the selected country code).

## 7. Test P1 -> P2

Use P1 in one normal browser session and P2 in an incognito/separate browser profile so each has a different Firebase account/session.

## 8. Verification commands

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

## 10. Historical Data Reconciliation Prerequisite (Controlled Backfill Plan)

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

