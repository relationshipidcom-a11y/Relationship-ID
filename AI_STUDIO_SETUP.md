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

Set the values from **Firebase Console -> Project settings -> General -> Your apps -> Web app**.

Do not copy values from the old project.

## 4. Firebase Authentication

Enable:

- Email/Password
- Google
- Phone

The app does not use Apple sign-in or phone-only login.

## 5. Test Google sign-in

If the embedded preview blocks the popup, use Open in new tab. If Firebase shows `auth/unauthorized-domain`, add that exact preview hostname in Firebase Authentication authorized domains.

## 6. Test phone OTP

Use a real mobile number you control. The app sends the E.164 canonical number to Firebase. The country code is selected separately from the national mobile number.

Do not add fake OTP code to the project.

## 7. Test P1 -> P2

Use P1 in one normal browser session and P2 in an incognito/separate browser profile so each has a different Firebase account/session.

## 8. Verification commands

```bash
npm run typecheck
npm run test:unit
npm run build
```

## 9. Stop before deployment

The current API data store is intentionally memory-backed for AI Studio functional testing. It resets when the server restarts. Do not deploy this build as production storage. The next backend step is Firestore persistence plus server-side authorization/security verification.
