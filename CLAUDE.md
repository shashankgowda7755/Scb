# SCB Event Platform — Project Memory

Single source of truth for this repo. Read first whenever resuming work.

---

## 1. Project Overview

**Product:** Event registration + attendance + reports platform for Standard Chartered Bank internal CSR events.

**Owner:** Shashank Gowda (`shashank@tndwwt.org`), Communitree.
**Repo:** `https://github.com/shashankgowda7755/Scb` · `main`
**Production:** `https://scbv1-eight.vercel.app`
**First event:** `CSR Activity Chennai — Quiz Calendar Creation` · 09 May 2026 · DLF Downtown.

**Why this exists (from the client call):**
- SCB compliance forbids personal data leaving the Google ecosystem.
- The existing Google Form + Sheet workflow lacks: duplicate prevention, live ops dashboard, automated retention purge.
- Communitree closes those three gaps without leaving the Google data path.

---

## 2. Current State (ship-ready)

### Live + working
- Firebase project `scb-event-registration` in `asia-south1` (Mumbai), Spark plan.
- Admin sign-in (Firebase Auth + `/users` allowlist, invite-only, no self-signup).
- Form Builder (no-code) per event — 9 field types matching Google Forms parity.
- Dynamic participant view (`?mode=register` / `checkin` / `checkout`) renders from `event.formFields`.
- Field-level AES-256-GCM encryption on every PII field before Firestore write.
- Firestore rules **DEPLOYED**: Public READ on `/registrations`, `/checkins`, `/checkouts` (returns ciphertext only — meaningless without the AES key). Admin-only READ on `/attendance`. Public read on `/events`. Anonymous WRITE allowed with shape validation (encrypted-field-or-legacy-clear back-compat). Updated 2026-05-26 because admin-only-read broke anonymous duplicate-check `getDoc` and produced 0% landed registrations during the meeting. See §17 + DEMO-COMPARISON.md §1 row 2 for the updated threat model.
- Phase D field expansion: `customData[*]`, `department`, `city`, `notes` all encrypted.
- Per-event activate / deactivate + per-form gates (Reg / Check-In / Checkout ON/OFF).
- Inactive event = cascaded form pills + participant lockout.
- Per-row Delete + toolbar Wipe All Data (with double confirm + typed WIPE).
- Check-in + Checkout with walk-in capture + duplicate guards.
- Attendance status engine (8 codes) — `COMPLETE / REG_CHECKIN / REG_ONLY / REG_CHECKOUT / WALKIN_COMPLETE / WALKIN_CHECKIN / WALKIN_CHECKOUT / NO_SHOW`.
- Reports tab — summary + status breakdown + filter + CSV + PDF.
- Full-screen success popup after every participant submit, with warnings for "no check-in" / "not registered" paths.
- Vercel security headers: HSTS, CSP, X-Frame-Options DENY, Permissions-Policy.
- `PROOF.html` standalone encryption demo at `/PROOF.html` for client walkthrough.

### Manual gates remaining
- Firestore TTL × 4 collections (`registrations`, `checkins`, `checkouts`, `attendance`) needs Console click-through (gcloud blocked on billing without Blaze). Without TTL, manual `Purge Event` still works.

### Free-tier limits (mitigated, not eliminated)
- AES master key inlined into JS bundle (`REACT_APP_DATA_KEY`). Bundle is also publicly readable now — so the moat is the key, period. Phase B (Cloud Function decrypt + Secret Manager) closes this.
- No Cloud Function encrypt/decrypt envelope yet (planned, needs Blaze).
- App-level audit log **SHIPPED** (`/audit` collection): sign-in/out, event create/edit/close/reopen/delete/reset, CSV export, Reveal decrypt, key rotate, admin add. Operator email encrypted at rest. Append-only via rules. View in operator dashboard → Audit Log tab.

### Today's fixes (2026-05-26 — meeting recovery)
- **Critical:** killed silent demo-mode fallback in `safeFirestoreWrite` that wrote to localStorage and returned fake success when Firestore rejected. Caused 10/10 phantom registrations during client demo.
- **Critical:** rules loosened to allow public ciphertext read so anonymous duplicate-check `getDoc` doesn't permission-deny.
- **Critical:** Vercel env vars added (`REACT_APP_FIREBASE_*`, `REACT_APP_DATA_KEY`) to Production + Development scopes. Prior builds relied on stale build cache containing inlined keys.
- **High:** invalid / missing eventId on participant URL no longer falls back to first available event. Shows explicit "Event link is not valid" page.
- **High:** `getDoc` → `getDocFromServer` on every dedupe path. Stale SDK cache after admin delete no longer triggers spurious "duplicate" modal.
- **Medium:** length caps on participant inputs (fullName 200, Bank ID 50, email 254, longtext 5000).
- **Medium:** 2-stage walk-in check-in flow (confirm → name → write).
- **Medium:** PROOF.html restored to deploy (was at repo root, never shipped).
- **Cosmetic:** duplicate-modal diff decrypts prior `participation`/`photoConsent` for display (was showing `enc:v1:...`).
- **Cosmetic:** login screen wrong-password shows "Wrong email or password" not raw Firebase error.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 (CRA + craco), TailwindCSS, shadcn/ui, Lucide icons |
| QR | `qrcode` npm package |
| Storage | Cloud Firestore, `asia-south1` (Mumbai), Spark plan |
| Encryption | Web Crypto API (`crypto.subtle`) — no third-party crypto library |
| Realtime | Firestore `onSnapshot` |
| Hosting | Vercel static deploy |
| Auth | Firebase Auth (email + password, invite-only via `/users` allowlist) |
| Local fallback | `localStorage` when Firebase env vars missing |

No third-party SaaS in the data path. React in browser + Firestore on Google Cloud + Vercel for static hosting.

---

## 4. Design System

### Palette (white / black / orange)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#0A0A0A` | Primary text, default CTA |
| `--paper` | `#FFFFFF` | All backgrounds |
| `--orange` | `#FF6B1A` | Accent, hover CTA, primary action buttons |
| `--orange-soft` | `#FFF1E8` | Status pill, helper banner, soft chip |
| `--orange-deep` | `#E5570A` | CTA hover, accent text |
| `--gray-200` | `#E5E5E5` | Borders |
| `--gray-500` | `#71717A` | Secondary text |

CSS file: `frontend/src/App.css`. Tokens in `:root`.

### Layout
- 248px fixed left sidebar + flex-grow main.
- Single-column page stacks (no 2-col grids).
- Card: white bg + 1px gray border + subtle hover.
- CTA: black default → orange on hover, with lift.
- Inputs: white bg, orange focus ring.
- Participant view: Google-Form-style with orange top stripe, centered card, ≤640 px width.
- Full-screen success popup: tone-aware (green good / orange warn / blue info) with big icon + title + body + timestamp.

---

## 5. Sidebar Navigation (drives `activeTab` state)

```
SCB Event Platform
└── Setup
    ├── Events            (list + delete + wipe all)
    └── Form Builder      (no-code form designer)
└── Operate
    ├── Registrations     (operator manual entry)
    ├── Check-In          (venue desk)
    ├── Checkout
    └── QR & Share        (QR code + share link + open participant)
└── Insights
    ├── Dashboard         (live counters + masked table + Reveal + CSV)
    └── Reports           (summary + status breakdown + CSV + PDF)
└── Trust
    ├── Security          (encryption narrative + key fingerprint + rotate)
    └── Admin Users       (invite-only allowlist management)
```

To add a new page: push an item to `navSections` + add a `<TabsContent value="X">` block. `App.js` is the single source of truth.

---

## 6. Form Builder — 9 field types (Google Forms parity)

| Type key | Renders on participant | Storage | Notes |
|---|---|---|---|
| `text` | `<input>` | string (encrypted) | |
| `longtext` | `<textarea rows=4>` | string (encrypted) | Paragraph answers |
| `email` | `<input type=email>` | string (encrypted) | Format validated when filled |
| `phone` | `<input type=tel>` | string (encrypted) | Format validated when filled |
| `radio` | N radios | string (encrypted) | Admin sets N options |
| `dropdown` | `<select>` | string (encrypted) | Admin sets N options |
| `checkboxes` | N checkboxes (multi-select) | **array** (JSON encrypted) | Each value in array |
| `checkbox` | One Yes checkbox | bool (clear) | Consent-style |
| `date` | `<input type=date>` | string (encrypted) | |

Always-on fields (cannot remove): Full Name, Bank ID (label renamable per event), Photo Consent.

Options editor: per-option rows with marker (○ / ▼ / ☐) + Add / Remove. Switching type to a list-typed kind auto-seeds one empty option row. Save strips blank options + rejects duplicates (case-insensitive).

CSV column for a `checkboxes` field renders as `Option A; Option B`.

---

## 7. Data Flow (V1)

```
1. Operator → Form Builder → New Event → save.
2. App generates eventId + QR URL:
     https://<deploy>/?event=<id>&mode=register
3. Operator auto-routes to QR & Share.
4. Employee scans QR on phone → participant view loads (clean, no admin).
5. Employee fills dynamic form (built from event.formFields).
6. Browser: AES-256-GCM encrypts fullName / employeeId / email / phone /
   department / city / notes / customData[*] string values.
   Bank ID is SHA-256 hashed with per-event salt → Firestore docId.
7. Encrypted record written to /registrations/{eventId}__{hash}.
8. Full-screen popup confirms outcome (green / orange / blue).
9. Operator dashboard (Firestore onSnapshot) reflects count live.
10. Operator sees masked previews by default. Click Reveal → in-browser
    decrypt → plaintext renders.
11. CSV Export → in-browser decrypt → file downloads with all custom
    columns + Phase D fields.
12. Check-in / Checkout flows mirror the same encrypt-write path.
13. computeAttendance(eventId) auto-runs as registrations / checkins /
    checkouts change → joins by dedupeHash → writes /attendance docs.
14. closeEvent(eventId) finalizes attendance + auto-runs computeAttendance.
15. Manual Purge Event OR Firestore TTL on expiresAt cleans up after
    retention window.
```

---

## 8. Encryption Details

- Cipher: AES-GCM, 256-bit key, 96-bit IV per record.
- Key source order: `REACT_APP_DATA_KEY` env var → `SCB_DATA_KEY_V1` localStorage (auto-generated if missing).
- Key fingerprint: `kid-<6 hex>` = SHA-256(key)[:6]. Safe to share — identifies the key without revealing it.
- Stored shape: `enc:v1:<base64-iv>.<base64-ciphertext>`.
- Rotation: `Rotate Key (Demo)` in Security tab. Prior records become `[decrypt failed]` (no historic re-encrypt on free tier).
- Dedupe: `docId = ${eventId}__${sha256(${eventId}::${normalize(bankId)}).slice(0,24)}`. Server never sees plain Bank ID.

### Encrypted fields per collection

**`/registrations`** — `fullName`, `employeeId`, `email`, `phone`, `department`, `city`, `notes`, every string in `customData{}`. Arrays in `customData{}` (checkboxes) are JSON-stringified before encrypt, parsed back on decrypt. Booleans in `customData{}` stay clear (consent-style).
**`/checkins`** + **`/checkouts`** — `uniqueId`, `fullName`.
**`/attendance`** — `uniqueId`, `fullName` (rolled up from the source).

Clear-text fields: `eventId`, `eventTitle`, `clientName`, `participation` ("Yes"/"No"), `photoConsent` (bool), `consent` (bool), `dedupeHash`, masked previews (`maskedFullName`, `maskedEmail`, …), `expiresAt`, timestamps, `revision`.

Code: `frontend/src/lib/crypto.js`, `frontend/src/lib/event-store.js`.

---

## 9. Data Model

### Collections
`events`, `registrations`, `checkins`, `checkouts`, `attendance`, `users`.

### `events/{eventId}`
```
{
  id, clientName, title, location, eventDate,
  duplicateField: "employeeId" | "email" | "phone",
  retentionDays: number,
  notes,
  status: "active" | "closed",
  registrationEnabled, checkInEnabled, checkOutEnabled: bool,
  description: "welcome paragraphs",
  uniqueIdLabel: "Bank ID" | "Employee ID" | ... ,
  formFields: [{ key, label, type, required, options[] }],
  createdAt, expiresAt
}
```

### `registrations/{eventId}__{sha256hash}`
```
{
  eventId, eventTitle, clientName, dedupeHash,
  fullName, employeeId, email, phone:   "enc:v1:...",
  department, city, notes:              "enc:v1:...",
  customData: { fieldKey: "enc:v1:..." | bool | <JSON-encrypted array> },
  participation: "Yes" | "No",
  photoConsent, consent: bool,
  maskedFullName, maskedEmail, maskedPhone, maskedEmployeeId,
  createdAt, updatedAt, expiresAt, revision, history[]
}
```

### `checkins` / `checkouts` / `attendance`
Per spec §6-8 in earlier message. `walkInFlag`, `statusCode`, masked previews, `checkInTime` / `checkOutTime` / `computedAt`.

### `users/{firebaseAuthUid}`
Admin allowlist mirror. Email + role.

---

## 10. Firebase Project

| Item | Value |
|---|---|
| Project ID | `scb-event-registration` |
| Project number | `730938451394` |
| Auth Domain | `scb-event-registration.firebaseapp.com` |
| Storage Bucket | `scb-event-registration.firebasestorage.app` |
| Web App ID | `1:730938451394:web:3cfb2a87566bf5224f625b` |
| Firestore region | `asia-south1` (Mumbai) |
| Plan | Spark (free) |
| Owner Google account | `artforawareness.official@gmail.com` |

Rules + indexes + TTL config: `firestore.rules`, `firestore.indexes.json`, `firebase.json` at repo root.

---

## 11. Vercel Project

| Item | Value |
|---|---|
| Project | `scbv1` |
| Team | `shashankgowda7755-5023s-projects` |
| Production URL | `https://scbv1-eight.vercel.app` |
| GitHub link | `shashankgowda7755/Scb` `main` branch (auto-deploy on push) |
| Env vars set | `REACT_APP_FIREBASE_*` × 6 + `REACT_APP_DATA_KEY` |
| Project root | `frontend` (deploys must run from `/Users/mukesh/scbv1`, not `frontend/`) |

Deploy command: `cd /Users/mukesh/scbv1 && vercel --prod --yes`.

---

## 12. Environment Variables (frontend/.env)

```
REACT_APP_FIREBASE_API_KEY=AIzaSyCof00j3wvL5fqfycO0gEGmKP5y4AjxgjI
REACT_APP_FIREBASE_AUTH_DOMAIN=scb-event-registration.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=scb-event-registration
REACT_APP_FIREBASE_STORAGE_BUCKET=scb-event-registration.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=730938451394
REACT_APP_FIREBASE_APP_ID=1:730938451394:web:3cfb2a87566bf5224f625b
REACT_APP_DATA_KEY=<32-byte base64 key>
```

`.env` is gitignored. Same values are set as Vercel production env vars. Losing `REACT_APP_DATA_KEY` = all encrypted records become permanently unreadable. Stash a backup.

---

## 13. Build / Run / Test

```bash
# Install
cd frontend && npm exec --yes yarn@1.22.22 -- install

# Dev server
cd frontend && yarn start              # http://localhost:3000

# Production build
cd frontend && yarn build

# Deploy to Vercel production
cd /Users/mukesh/scbv1 && vercel --prod --yes

# Audit deps
cd frontend && yarn audit
```

### Smoke path
1. `localhost:3000` → admin sign in.
2. Form Builder → New event with description + custom Department field + Checkboxes "Interests" field.
3. Save → auto-route to QR & Share.
4. Scan QR on phone → submit registration with multi-select checkboxes.
5. Dashboard count ticks up. Default view shows masked previews.
6. Reveal → plaintext renders (decryption in-browser).
7. CSV export → file contains decrypted plaintext + one column per custom field.
8. Submit same Bank ID again → duplicate modal with Keep / Update.
9. Switch to Check-In → enter same Bank ID → green success popup.
10. Switch to Checkout → enter same Bank ID → green success popup.
11. Switch to Checkout with an unknown Bank ID → orange warning popup, captured as walk-in.
12. Reports → see status breakdown + attendee detail table + Export PDF.
13. Security tab → Rotate Key → prior records show `[decrypt failed]` (free-tier orphan demo).
14. Events → Delete Event → cascades across all 5 collections.

---

## 14. File Structure

```
scbv1/
├── CLAUDE.md                          # this file
├── README.md                          # public-facing project summary
├── DEMO_SCRIPT.md                     # 12 PM call crib sheet
├── REPORT.md                          # technical report (13 sections)
├── SLIDES.html                        # self-contained reveal.js deck
├── TEXT_INVENTORY.md                  # every UI string for copy review
├── PROOF.html                         # standalone encryption demo
├── PRODUCTION_SETUP.md                # operator runbook (Firebase + Vercel)
├── firebase.json
├── firestore.rules                    # Phase A: admin-only reads
├── firestore.indexes.json             # TTL config for *.expiresAt
└── frontend/
    ├── .env                           # gitignored — real Firebase + key
    ├── .env.example                   # template
    ├── vercel.json                    # rewrites + CSP/HSTS/security headers
    ├── package.json
    ├── src/
    │   ├── App.js                     # ~3700 lines: sidebar shell + 11 TabsContent + participant routes + popup
    │   ├── App.css                    # white/black/orange design system
    │   ├── index.js
    │   ├── components/ui/             # shadcn primitives
    │   └── lib/
    │       ├── firebase.js            # Firestore bootstrap + demo mode detect
    │       ├── auth.js                # signIn / signOut / createAdminUser
    │       ├── event-store.js         # CRUD + encryption + dedupe + status engine
    │       ├── crypto.js              # AES-256-GCM + fingerprint + rotate
    │       └── utils.js               # cn() helper
    └── public/
        ├── index.html
        └── favicon...
```

---

## 15. Hardening Path (post-client-greenlight, needs Blaze)

- **Cloud Function envelope encryption.** Master key in Google Secret Manager, browser never holds it. Decrypt only via authenticated callable.
- **Audit log.** `/audit/{autoId}` records reveal / decrypt / export / purge with operator UID + timestamp.
- **Re-encrypt on rotate.** Cloud Function reads every record, decrypts with old key, re-encrypts with new — no orphans.
- **Google Sheet mirror.** Cloud Function trigger on registration create → push decrypted row into SCB-approved Sheet.
- **Firebase App Check + reCAPTCHA v3.** Rate-limit anonymous registration writes (free tier).
- **Sentry hobby tier.** Browser error monitoring (free, 20-min wire-up).
- **SSO with the bank.** Firebase Auth supports SAML/OIDC.

---

## 16. Conventions

- Frontend imports use `@` alias for `frontend/src`.
- Sensitive fields encrypted at the source — never logged, never sent in URLs.
- Masked previews are deterministic — no plaintext leakage.
- Every record carries `expiresAt` for Firestore TTL.
- Duplicate prevention is per-event, driven by `event.duplicateField`.
- Participant-facing copy: NO words "encrypted" / "masked" / security jargon. Operator-facing copy: precise terms (Reveal / Decrypt / Encrypted Fields / etc).

---

## 17. Security Rules for AI-Generated Apps (Taha Jaffri's 13-rule checklist)

Every AI-generated change must clear all 13. Current per-rule status:

1. **Secrets in env only** — ✅ `.env` gitignored. ⚠️ `REACT_APP_DATA_KEY` inlined in JS bundle by CRA (free-tier limit; Phase A rules mitigate).
2. **Rate limiting** — ❌ None today. Firebase App Check + reCAPTCHA v3 is the free-tier fix.
3. **Input validation** — ✅ Client-side + Firestore rule shape checks.
4. **Auth** — ✅ Firebase Auth + `/users` allowlist (invite-only). ⚠️ Lockout uses Firebase defaults.
5. **SQL / DB** — ✅ Firestore (NoSQL); no SQL injection surface.
6. **CORS** — ✅ Firestore SDK + Vercel default same-origin.
7. **HTTP headers** — ✅ HSTS + CSP + X-Frame-Options DENY + Permissions-Policy.
8. **File uploads** — ✅ N/A.
9. **Error handling** — ⚠️ Generic messages to user; no Sentry yet.
10. **Dependency security** — ⚠️ `yarn.lock` pinned; 161 dev-only CRA vulns (none in client bundle).
11. **XSS** — ✅ Zero `dangerouslySetInnerHTML`; React escapes by default.
12. **Deploy gate** — ✅ `.env` gitignored, HTTPS, debug off, CORS scoped. ❌ rate limit pending.
13. **AI / LLM rules** — ✅ N/A.

Future AI edits must keep ✅ lines ✅ and improve ⚠️/❌. If a rule changes status, update this section in the same commit.

---

## 18. Open Threads

- [ ] **Manual TTL setup** — 4 console clicks at `https://console.firebase.google.com/project/scb-event-registration/firestore/databases/-default-/ttl`. Pick each of `registrations` / `checkins` / `checkouts` / `attendance` → field `expiresAt` → Create. (Gcloud CLI blocked: needs Blaze billing.)
- [ ] Firebase App Check + reCAPTCHA v3 (rate limiting). Free tier. ~30 min.
- [ ] Sentry hobby tier. Free. ~20 min.
- [ ] V2 hardening (Cloud Functions envelope, audit log, re-encrypt on rotate) — needs Blaze.
