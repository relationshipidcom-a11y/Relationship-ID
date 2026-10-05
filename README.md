# Relationship ID — AI Studio Test Build

This project is prepared for the **new** Relationship ID Google AI Studio / Firebase environment.

## What is implemented

- React + Vite + TypeScript UI based on the latest uploaded project.
- Firebase Email/Password authentication.
- Firebase Google sign-in with popup and redirect fallback.
- Real Firebase Phone Authentication flow with OTP and invisible `RecaptchaVerifier`.
- Country code before mobile number and E.164 normalization.
- WhatsApp rule: same as verified mobile is trusted without a second OTP; a different WhatsApp stays unverified until a real WhatsApp ownership provider is added.
- P1 relationship stage + required relationship start date.
- P1 partner information and secure invitation links.
- P2 invitation -> authentication -> own profile -> real mobile verification -> accept/decline.
- Certificate created only after backend acceptance.
- Real QR code pointing to the privacy-safe public verification route.
- Public verification exposes names, stage, start date and status only.
- No payments, no Apple sign-in, no AI coach, no automatic deployment.

## Backend Architecture and Server Credentials

The backend uses durable Firestore persistence via the Firebase Admin SDK (`adminDb`), connecting to database `(default)` under project `relationship-id`. The server does NOT use an in-memory or fake data store.

### Frontend Web vs. Backend Admin Credentials
- **Client Web App (`VITE_FIREBASE_*`)**: The browser React app uses client configuration exclusively for client-side Firebase Authentication (Email/Password, Google Sign-In, Phone OTP). Client keys never have Admin database privileges.
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

### Automatic Deletion Reconciliation
Deletion cleanup must be triggered by Google Cloud Scheduler calling POST /internal/reconcile every 10 minutes with header X-Reconcile-Secret. The in-process timer is only a backup. For launch, run the server with a single instance (Cloud Run max instances = 1) so rate limits are enforced consistently.

## AI Studio setup

1. Create/open your **new AI Studio app** under the new Google account.
2. Open the code/files view.
3. Replace the starter project files with the contents of this ZIP. Do not mix them with the old Relationship ID project.
4. Let AI Studio install dependencies with:

   ```bash
   npm install
   ```

5. Add the Firebase Web App environment values in AI Studio:

   ```text
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_STORAGE_BUCKET
   VITE_FIREBASE_MESSAGING_SENDER_ID
   VITE_FIREBASE_APP_ID
   VITE_FIREBASE_MEASUREMENT_ID   # optional
   FIREBASE_PROJECT_ID            # use the same new Firebase project ID
   ```

6. In the **new Firebase project**, enable Authentication providers:
   - Email/Password
   - Google
   - Phone
7. Add the AI Studio preview/browser hostname to **Firebase Authentication -> Settings -> Authorized domains** if Firebase reports `auth/unauthorized-domain`.
8. Start the app:

   ```bash
   npm run dev
   ```

## Required checks in AI Studio

Run these after `npm install`:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Do not call a check PASS unless AI Studio shows a successful exit/result.

## Manual end-to-end test

1. Open the app in a normal browser tab from AI Studio Preview.
2. P1 creates/signs into a real Firebase account.
3. P1 enters a mobile number with country code and completes a real SMS OTP.
4. Confirm WhatsApp = same verified mobile becomes Trusted without a second OTP.
5. Select relationship stage and start date.
6. Enter Partner 2 information and create invitation.
7. Confirm Waiting page.
8. Copy/open the invitation in an incognito window or separate browser profile.
9. P2 signs up/signs in and returns to the same invitation.
10. P2 completes own profile and real phone OTP.
11. P2 accepts.
12. Confirm P1 and P2 resolve to the same relationship and certificate during that running server session.
13. Open the QR/public verification URL and confirm no DOB, email, mobile, WhatsApp or Firebase UID is exposed.

If Google popup or Phone/reCAPTCHA is blocked in the embedded AI Studio preview, open the preview in a **separate browser tab** before changing code.

## Deployment

**DO NOT DEPLOY YET.** Complete the AI Studio verification first, ensure backend Application Default Credentials and security tests pass, and only deploy upon explicit authorization.
