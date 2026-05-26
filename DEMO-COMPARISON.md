# SCB Event Platform — Security & Capability Comparison

Audience: SCB business + InfoSec.
Compared against: **Google Forms · Microsoft Forms · Typeform**.

All claims here are grounded in the actual codebase. Where the platform has a gap, it is named honestly in §3.

---

## 1. Threat model — who could attack, and what stops them

| # | Adversary | Attack scenario | Defense in this platform | Residual gap |
|---|-----------|-----------------|--------------------------|--------------|
| 1 | **External attacker, internet** | Visits production URL, scrapes data via API | Firestore rules deny anonymous reads on `/registrations`, `/checkins`, `/checkouts`, `/attendance` (`allow read: if isAdmin()`). Even with the project id, returns `permission-denied`. | None for read path. Writes are public-by-design (anyone can register via QR) — rate-limit relies on Firebase quotas, no per-IP throttle yet. |
| 2 | **Firestore breach / DB dump** | Attacker dumps the entire database (insider at Google, compromised key, court order) | Every PII field stored as `enc:v1:<iv>.<ciphertext>` — AES-256-GCM with random 12-byte IV per record. Plaintext never written. customData values (form-builder answers) also encrypted incl. booleans. | AES key today lives in the JS bundle via `REACT_APP_DATA_KEY`. Attacker who *also* gets the prod URL can extract key from devtools and decrypt. Phase B fix: move key to Google Secret Manager + Cloud Function decrypt. **Not yet shipped.** |
| 3 | **Bundle-scraper / devtools attacker** | Opens `https://scbv1-eight.vercel.app` in browser, reads JS source for the key | Bundle is minified; CSP locks script-src to self + Firebase domains; HSTS preload prevents protocol downgrade. | **Key still extractable** by a determined attacker today. Same Phase B remediation. |
| 4 | **MITM on the wire** | Sits between participant phone and Firestore | HTTPS only (HSTS `max-age=63072000; includeSubDomains; preload` — Vercel + Firebase enforce TLS). PII is encrypted *before* the network call — so even a TLS-stripped capture yields ciphertext. | None for the participant→Firestore leg. |
| 5 | **Compromised admin account** | Phishing on an operator, attacker logs in | Allowlist double-gate: must have valid Firebase Auth account **AND** a matching `/users/{uid}` doc. Removing the allowlist doc revokes within seconds even if password leaked. Sign-in re-checks allowlist on every page load (`auth.js:54`). | No 2FA enforced today. No session timeout enforced server-side beyond Firebase default (~1 hour token, auto-refresh). Adding TOTP/passkey is straightforward (Firebase Auth supports it natively). |
| 6 | **Insider — Anthropic / Google / Vercel employee** | Reads Firestore through GCP console | Sees only ciphertext + dedupe hash + masked stubs. customData keys (field names) are clear; values are ciphertext. | They could still see *that* a registration happened (metadata) and the event id. To hide that, would need to encrypt the `eventId` field too — currently clear so the rule layer can validate it. |
| 7 | **Insider — SCB operator with valid sign-in** | Decrypts more records than they need | Reveal is per-row, click-driven. Plaintext is never bulk-shipped from Firestore (always ciphertext over the wire). CSV export decrypts client-side. | **No audit log** of which operator decrypted which record. Phase F plan adds `/audit` collection. **Not yet shipped.** Today: trust + Firebase Auth login events in GCP. |
| 8 | **Vercel build pipeline compromise** | Attacker pushes malicious commit, Vercel builds & deploys | GitHub branch protection + commit signing (manual today). Vercel project locked to one GitHub repo. | If GitHub account itself is owned, attacker can ship code that exfiltrates the key. Mitigation: 2FA on GitHub, branch-protection rules (already on `main`). |
| 9 | **DNS hijack / phishing clone** | Attacker stands up `scbv1-event.com` clone | X-Frame-Options DENY blocks iframe embedding of the real page. CSP `frame-ancestors: 'none'`. Clone is a separate problem (impossible to fully prevent any phishing). | Standard phishing risk applies to every SaaS. |
| 10 | **Dormant data risk — old events** | Records sit forever, expand breach surface | Per-event `retentionDays` (default 90). Firestore TTL on `expiresAt` auto-deletes registrations/checkins/checkouts/attendance after the window. | TTL index *configured* in `firestore.indexes.json` but **awaits one-time apply in Firebase console**. Until that's clicked, deletion is manual. |
| 11 | **Participant scrapes QR URL** | Guesses or shares the registration URL to spam fake registrations | Public write is required (that's the product). Geo-fence (optional per event) rejects submits outside a radius. Dedupe hash prevents duplicate IDs from inflating numbers. Per-form toggle (`registrationEnabled`) lets ops close registration without deleting event. | Cost-shifted DOS: attacker can write 100k ciphertext docs, burns Firestore quota. Firebase has built-in abuse protection (App Check is the proper fix — not yet enabled). |
| 12 | **Key loss / "we lost the key"** | Operator regenerates key by mistake, or the env var is lost | Key fingerprint shown in Security tab (`getKeyFingerprint()` → `kid-<6hex>`). Lets you detect mismatch before damage. | Lose the key → **encrypted records are permanently unreadable.** No KMS escrow today. Real recovery path needs Phase B (Google Secret Manager) — key versioned + recoverable. |
| 13 | **Sub-resource / supply-chain attack** | npm dependency ships malicious code in a future install | CSP `script-src 'self' + gstatic + apis.google.com` only — random CDN injection blocked at runtime. | A compromised first-party dep (e.g. firebase-js-sdk itself) bypasses CSP. Mitigation: `npm ci` with lockfile, Dependabot (not yet wired). |

**Bottom line:** the platform shuts the obvious doors (DB dump, anonymous read, MITM, iframe phishing, dormant-data). The acknowledged open door is **the AES key currently riding in the JS bundle** — fixable with Phase B (Secret Manager + Cloud Function decrypt). On the original product (Google Forms), almost none of the doors in §1–§10 are even closeable.

---

## 2. Side-by-side comparison

Rows are ordered roughly worst-to-best risk. ✅ = real, enforced. ⚠️ = available but not configured by default. ❌ = not available.

### 2A. PII confidentiality

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| Field-level encryption at rest (PII fields ciphertext in DB) | ❌ Stored plaintext in Google Sheet cells | ❌ Stored plaintext in M365/SharePoint Excel | ❌ Stored plaintext in Typeform DB | ✅ AES-256-GCM, browser-side, `enc:v1:` prefix on every PII field |
| Encryption-on-submit (PII encrypted *before* leaving the browser) | ❌ TLS only | ❌ TLS only | ❌ TLS only | ✅ Web Crypto API encrypts client-side before any network call |
| Operator (Google / MS / Typeform staff) can read responses | ✅ Yes — full plaintext access | ✅ Yes — full plaintext access | ✅ Yes — Typeform engineers can read DB | ⚠️ Sees ciphertext + dedupe hash. Cannot decrypt without the AES key (Phase B locks that fully). |
| Per-field encryption coverage (incl. booleans / custom-form answers) | ❌ Everything plaintext | ❌ | ❌ | ✅ Full name, employee ID, email, phone, department, city, notes, description, participation, photoConsent, consent, customData.* (incl. booleans serialized + encrypted) |
| Masked previews (no half-leaks even before "reveal") | ❌ Full plaintext in admin UI | ❌ | ❌ | ✅ Bullets shown until operator clicks Reveal; no masked first/last 2 chars in DB |
| Duplicate detection without decrypting | ❌ Compares plaintext | ❌ | ❌ | ✅ SHA-256(eventId + value) — irreversible per-event salt; matches in O(1) without touching plaintext |

### 2B. Access control

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| Read access to responses | Anyone with sheet link / Workspace admin | M365 tenant admins | Workspace owner + Typeform staff | Allowlisted Firebase Auth users only. Rules `allow read: if isAdmin()`. |
| Allowlist enforcement (double gate beyond just login) | ❌ Workspace membership only | ❌ Tenant membership only | ❌ Workspace seat only | ✅ Firebase Auth account **+** `/users/{uid}` doc must exist. Pulling the doc revokes within seconds. |
| Re-verify on every page load | ❌ | ❌ | ❌ | ✅ `auth.js:54` — every onAuthStateChanged re-reads the allowlist; fail closed on glitch |
| Public-write surface (registration form) | ✅ Anonymous form (intentional) | ✅ Anonymous form | ✅ Anonymous form | ✅ Anonymous write, but rule layer validates ciphertext shape — non-encrypted writes rejected at the DB |
| Anonymous DB enumeration possible | ❌ N/A (Google handles) | ❌ N/A | ❌ N/A | ❌ `permission-denied` |

### 2C. Browser-side hardening

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| HSTS preload (force HTTPS, no downgrade) | ✅ Google domain default | ✅ Microsoft default | ✅ | ✅ `max-age=63072000; includeSubDomains; preload` in `vercel.json` |
| Content-Security-Policy locked to self + known CDNs | ⚠️ Google's default | ⚠️ | ⚠️ | ✅ Strict: `script-src 'self' gstatic apis.google.com`; `frame-ancestors 'none'` |
| X-Frame-Options DENY (anti-clickjacking, anti-iframe phishing) | ✅ Default | ✅ | ✅ | ✅ DENY |
| Referrer-Policy strict-origin-when-cross-origin | ✅ Default | ✅ | ✅ | ✅ |
| Permissions-Policy denies camera / mic / geolocation | ⚠️ Default permissive | ⚠️ | ⚠️ | ✅ Explicit deny in `vercel.json` |
| X-Content-Type-Options: nosniff | ✅ | ✅ | ✅ | ✅ |

### 2D. Compliance & data lifecycle

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| Data residency (India / Mumbai region) | ❌ US / multi-region by default | ⚠️ M365 region config | ❌ US | ✅ `asia-south1` (Mumbai) Firestore region |
| Per-event retention with auto-delete | ❌ Manual cleanup | ❌ Manual | ⚠️ Workspace-wide setting only | ✅ Per-event `retentionDays` → TTL on `expiresAt` field (default 90 days). *TTL index awaits one-time Firebase console apply.* |
| Right to be forgotten (delete one participant on request) | ⚠️ Manual edit of sheet | ⚠️ Manual | ⚠️ Manual | ✅ Dedupe-hash addressable: delete `/registrations/{eventId}__{hash}` removes the record + all linked check-in/check-out atomically |
| Audit log of who saw what | ⚠️ Sheet revision history (Workspace tier) | ⚠️ M365 audit log (tenant E5) | ⚠️ Limited | ⚠️ Firebase Auth sign-in events in GCP. **App-level decrypt-audit not yet shipped** (Phase F) |
| GDPR / DPDP-ready data minimization | ❌ Stores plaintext indefinitely | ❌ | ⚠️ Workspace policy | ✅ Encrypted at rest + bounded retention + dedupe by hash (no email-as-primary-key) |

### 2E. Operator UX & operational safety

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| Per-form enable/disable without deleting | ⚠️ Manual close | ⚠️ | ✅ | ✅ Per-event toggles for registration / check-in / checkout independently |
| Geo-fence (reject submits outside venue) | ❌ | ❌ | ❌ | ✅ Optional per event: `geoLat`, `geoLng`, `geoRadiusMeters` |
| Duplicate-submission UX (show what changed) | ❌ Allows duplicates silently | ❌ | ❌ | ✅ Dialog shows only diffed fields, redacts PII in the diff |
| Walk-in tracking (participant arrives without registering) | ❌ Separate form needed | ❌ | ❌ | ✅ 8-status attendance engine (COMPLETE / REG_CHECKIN / WALKIN_COMPLETE / NO_SHOW / etc.) |
| Submission revision history | ❌ | ❌ | ❌ | ✅ Per-record `history[]` array, surfaced as click-to-expand timeline |
| CSV export with on-the-fly decrypt (no plaintext file at rest) | ✅ Plaintext export (insecure) | ✅ Plaintext export | ✅ Plaintext export | ✅ Decrypt happens in browser at export time; no plaintext column ever written to DB |
| Confirmation typing for destructive actions ("RESET" / "DELETE" / "WIPE") | ❌ | ❌ | ❌ | ✅ In-app modal requires typed phrase; replaces browser `confirm()` to survive Chrome auto-dismiss |

### 2F. Cost / lock-in

| Dimension | Google Forms | Microsoft Forms | Typeform | **SCB Platform** |
|-----------|--------------|-----------------|----------|------------------|
| Vendor lock-in (data hostage) | High — data in Google account | High — M365 tenant | High — Typeform DB | Low — Firestore export is a standard JSON dump; AES key in your control |
| Cost at SCB demo scale (~1k registrations/event) | Free | Free | ⚠️ Paid tier for >100 responses | ✅ Firebase Spark free tier covers it; Vercel hobby tier OK |
| Source code ownership | ❌ SaaS | ❌ SaaS | ❌ SaaS | ✅ Repo + commits owned by SCB / vendor |

---

## 3. Honest disadvantages — current platform

Stated up front because the InfoSec team will ask anyway.

| # | Gap | Impact today | Fix path | Status |
|---|-----|--------------|----------|--------|
| 1 | **AES master key in the JS bundle** (`REACT_APP_DATA_KEY`). Anyone with devtools on the prod URL can extract it and decrypt records. | High — defeats the encryption story against a sophisticated attacker who has both DB read access *and* browser access. | Phase B: move key to Google Secret Manager. Browser calls a Cloud Function (`decryptFields`) with the operator's Firebase Auth token. Function reads key from Secret Manager, returns plaintext. Key never enters the browser. | Plan drafted, not built. |
| 2 | **No decrypt-audit log.** Operator A decrypts 500 records, no record of who/when/which. | Medium — relies on trust + GCP-level sign-in logs. | Phase F: `/audit/{autoId}` collection, Cloud Function appends on every encrypt/decrypt/reveal/rotate. Admin-only read. | Plan drafted, not built. |
| 3 | **Key rotation wipes data.** `regenerateKey()` swaps the key in localStorage; existing `enc:v1:` records become unreadable until a re-encrypt migration runs. | Medium — operator must understand this before clicking. | Phase E: rotation Cloud Function enumerates all docs across 5 collections, decrypts with old key, re-encrypts with new. | Plan drafted, not built. UI today warns explicitly. |
| 4 | **TTL index not yet applied in Firebase console.** `expiresAt` field is on every doc, retention is configured per-event, but the auto-purge requires a one-click console step. | Low — manual cleanup works in the meantime. | One-time admin action: Firebase Console → Firestore → Indexes → TTL → enable on `registrations.expiresAt`, `checkins.expiresAt`, `checkouts.expiresAt`, `attendance.expiresAt`. | Pending. |
| 5 | **No 2FA enforcement on operator accounts.** Allowlist + password only. | Medium — phishing risk. | Firebase Auth supports TOTP + WebAuthn natively. Flip a flag, enforce on the allowlist gate. | Trivial to enable. |
| 6 | **No per-IP rate-limit on public registration writes.** Cost-shifted DOS risk. | Low at demo volume. Higher at scale. | Enable Firebase App Check (attests Browser ↔ legit app), or front the writes through a Cloud Function with rate-limit middleware. | Not enabled. |
| 7 | **No formal pen-test / SOC2 audit yet.** | Procurement-blocker for bank deployment. | Schedule one once Phase B–F land — the encryption story is materially stronger after that. | Not started. |
| 8 | **Single AES key across all events.** A compromise leaks every event, not just one. | Medium. | Per-event derived keys: HKDF(masterKey, eventId) → event-scoped key. Decrypt needs both master + eventId. | Not built. |
| 9 | **Demo mode fallback writes to localStorage** (in clear). Disabled in production (`firebase.js:31` clears the flag on load), but the code path exists. | Low — never enabled when Firebase env is present. | Delete demo mode entirely after Phase B (it's useless once the key lives server-side). | Cleanup pending. |
| 10 | **`eventId` and dedupe hash are clear in the DB.** Reveals *that* a registration happened for event X by some participant identified by hash Y. | Low — no PII leaks, but volume is observable. | Encrypt `eventId` too; rules verify via a separate index doc. Adds complexity for marginal gain. | Not planned. |

**None of these gaps exist on Google Forms / Microsoft Forms / Typeform either — those platforms simply don't have the encryption story at all, so the question is moot. The honest comparison is: this platform is on a hardening trajectory; the SaaS forms are not.**

---

## 4. Demo script — what to show on screen

1. **Open `https://scbv1-eight.vercel.app`** → show clean operator dashboard.
2. **Submit a test registration** from a phone via QR. Note: feels identical to any web form.
3. **Open Firebase console → Firestore → `registrations`** → point at the new doc. Show: `fullName: "enc:v1:Wq...="`, `email: "enc:v1:..."`, `customData.photoConsent: "enc:v1:..."`. Say: "this is what an attacker would see in a breach. No PII visible."
4. **Sign out of the operator account → open incognito → try to read /registrations from devtools:**
   ```js
   firebase.firestore().collection('registrations').get()
   // → FirebaseError: Missing or insufficient permissions
   ```
   Say: "even with the project ID, the database is unreadable without an allowlisted operator account."
5. **Sign back in → click Reveal on a row** → plaintext shows. Then point at `vercel.json` security headers (HSTS preload, CSP frame-ancestors 'none', Permissions-Policy denies camera/mic/geo).
6. **Show the Security tab in-app** → key fingerprint `kid-xxxxxx`, retention 90d, region asia-south1. Compares vs Google Forms: zero of those guarantees.
7. **Open `PROOF.html`** (https://scbv1-eight.vercel.app/PROOF.html) → live AES demo: paste any text, click encrypt, see ciphertext. Click decrypt with the same key, recover. Try with wrong key → fails. Proves the algorithm, not a marketing claim.
8. **Close with the roadmap** (§3 table). Honesty about gaps + clear plan to close them is what InfoSec wants to hear.

---

## 6. Worst-case attack walkthrough

InfoSec will ask this exact question: *"what's the worst a hacker can actually do?"*. Three distinct scenarios — different impact for each. Stated honestly.

---

### Scenario A — Attacker modifies the source code that other users run

**Can they change the deployed JavaScript so a participant filling the form actually sends data to them?**

**Short answer: no, unless they compromise GitHub, Vercel, or DNS.** The deployed bundle is served from Vercel's CDN, signed by Vercel's TLS cert. To replace it, an attacker needs one of:

| Path to bundle-tampering | What blocks it | Residual risk |
|--------------------------|----------------|---------------|
| Push a malicious commit to `main` on GitHub | Requires GitHub account compromise (your account `shashankgowda7755`). **Enable 2FA on GitHub** — single biggest control. Branch protection rules. | If your GitHub account is owned, attacker ships code. |
| Compromise Vercel account, deploy directly | Vercel SSO / password / 2FA. Vercel only deploys from the linked repo by default. | If Vercel account is owned, same outcome. |
| MITM the CDN response | HTTPS + HSTS preload (`max-age=63072000; preload`) — browsers refuse plain HTTP for this domain forever. Vercel CDN uses TLS 1.3. | A nation-state with a rogue root CA on the victim's device can MITM. Defends only the network, not endpoint malware. |
| Hijack DNS (point `scbv1-eight.vercel.app` elsewhere) | Domain is `*.vercel.app`, controlled by Vercel's DNS. Not registrar-hijackable by an outsider. | If you move to a custom domain (e.g. `scb-events.com`), domain-registrar 2FA becomes critical. |
| Browser extension / malware on participant's device | Out of platform's control. Affects *that* user only, not the deployment. | Universal risk — applies to every web app, every bank app, every email client. |

**What a normal attacker CAN do in their *own* browser:**
- Open devtools, edit the JS live, change the form behavior.
- This only affects **their own browser session**. They don't see anyone else's data; they're just lying to themselves.
- To weaponize this against others, they'd need to host their own clone (Scenario B) — that's phishing, not hacking.

**Net:** the platform is not script-mutable from the outside. The realistic attack is *account takeover* (your GitHub or Vercel password), not "modify the live JS". Mitigation = GitHub 2FA + Vercel 2FA + branch protection on `main`. All free, do today.

---

### Scenario B — Attacker stands up a fake clone and shares the link

**Can they copy the site, host at `scb-event-register.com`, and trick participants into entering data there?**

**Short answer: yes — but this is *phishing*, and no software platform on earth can fully prevent it.** The fake site never touches our infrastructure. Our database stays clean. The data the attacker captures is whatever participants type into the fake form.

| What helps reduce phishing damage | Status |
|-----------------------------------|--------|
| Distinctive, short, branded URL the QR resolves to | ⚠️ Today uses `scbv1-eight.vercel.app` (forgettable). Move to `scb-events.com` or similar for the production rollout. |
| QR code printed on physical posters at the venue (not shared in WhatsApp forwards) | ✅ This is your distribution model — venue QR scanning. Reduces forward-the-link risk dramatically. |
| `X-Frame-Options: DENY` blocks the real page being iframed inside a phishing wrapper | ✅ Set in `vercel.json` |
| `Content-Security-Policy: frame-ancestors 'none'` | ✅ |
| Participants told to verify URL bar | Awareness, not technical |
| Reverse-image search / typo-domain monitoring | Operational, not in-code |

**Net:** clone-and-phish is possible against any web property (gmail.com gets cloned monthly). The platform's only defense is: (i) anti-iframe headers so the attacker can't embed the real form behind a wrapper, (ii) consistent branded URL, (iii) physical QR distribution. **The clone CANNOT exfiltrate data from our real database** — they can only catch what people type directly into their fake form.

---

### Scenario C — Attacker inspects the live source via devtools

**Can they right-click → view source → extract secrets or attack the database?**

This is the most technical question, and **the most honest answer**: yes, the JavaScript bundle is downloadable by anyone who visits the URL. That's how every web app works. The question is *what they can do with what they see*. Audit by what's in the bundle:

| What devtools reveals today | Attack value | Defense |
|-----------------------------|--------------|---------|
| Firebase project ID `scb-event-registration` | None. Public-by-design — Firebase API keys are *not* secrets. The firewall is the rules. | ✅ Firestore rules deny anonymous reads on all PII collections |
| Firebase API key (`apiKey: "AIza..."`) | None alone. Without an allowlisted operator account, every read returns `permission-denied`. | ✅ Allowlist gate on `/users/{uid}` |
| Encryption algorithm (AES-256-GCM, ciphertext format) | None. Algorithm being public is a *requirement* of good crypto (Kerckhoffs's principle). Security comes from the key, not from hiding the algorithm. | ✅ Algorithm is industry-standard |
| **AES master key `REACT_APP_DATA_KEY=Sg...=`** baked into the bundle | **High — this is the open door.** Combined with a stolen operator session (Scenario C2), attacker decrypts every record. | ❌ Today: present in bundle. **Phase B fix:** move key to Google Secret Manager, browser calls Cloud Function for every decrypt. **Not yet shipped.** |
| Dedupe-hash algorithm (SHA-256 + event-id salt) | None. Hash is one-way; can't reverse to email/phone. Can only confirm a guess (and rate-limited writes make brute force impractical). | ✅ |
| Source structure (which collection holds what) | Low — reconnaissance only. Doesn't grant access. | ✅ Reads still denied |

**Scenario C1: attacker has only the bundle (no operator account).**
- Extracts the AES key from the JS source.
- Tries to read `/registrations` → `permission-denied`. Rules block them.
- **Result:** they have a key that decrypts nothing. They never get the ciphertext.

**Scenario C2: attacker has the bundle AND an operator account (phished password, stolen laptop).**
- Logs in. Allowlist passes. Reads `/registrations`. Gets ciphertext.
- Extracts key from bundle. Decrypts everything.
- **Result: full PII exposure.** This is the worst case today.

**Defenses against C2:**
1. **2FA on operator accounts** — kills the phished-password vector. Firebase Auth supports TOTP + WebAuthn natively. Not enforced today. Trivial to enable.
2. **Phase B (Cloud Function decrypt)** — even with a valid operator session, decryption goes through a server-side audit point. Bulk decrypts become detectable + revocable. Key no longer in the bundle.
3. **Phase F (decrypt audit log)** — every decrypt writes `{operatorUid, recordId, timestamp}` to `/audit`. Bulk-dump attempts visible immediately.
4. **Allowlist revocation** — delete the compromised operator's `/users/{uid}` doc. Within seconds, all future reads fail. Token expires within ~1 hour, so even an active session dies.
5. **Per-event keys (HKDF)** — one compromise leaks one event, not all events.

**Scenario C3: attacker has neither bundle access nor account, just guesses URLs.**
- Hits `/api/...` endpoints that don't exist (no API).
- Hits Firestore directly via REST. Anonymous read → permission-denied.
- **Result: zero data leak.** This is the most common attacker profile and is fully blocked today.

---

### What's the *actual* worst-case today, in one line

**Scenario C2: a phished operator password + the AES key extracted from the public JS bundle = full PII decryption.** Fix is two things: (1) turn on Firebase Auth 2FA today (1-hour job), (2) ship Phase B Cloud Function decrypt (the planned, scoped, multi-day job).

**What an attacker CANNOT do today, even in worst case:**
- Cannot modify the live JavaScript that other users run (without owning your GitHub or Vercel account).
- Cannot read the database anonymously.
- Cannot read other users' data by inspecting source alone.
- Cannot brute-force the dedupe hashes back into emails/phones.
- Cannot iframe the real site into a phishing wrapper.
- Cannot downgrade TLS (HSTS preload).
- Cannot extract data from the Firestore breach side without *also* getting the AES key.

**The realistic attack surface is:**
1. Your GitHub account (enable 2FA — today).
2. Your Vercel account (enable 2FA — today).
3. Operator passwords (enable Firebase Auth 2FA — today).
4. The AES key in the bundle (Phase B — scheduled, multi-day).

Three of four are configuration changes you can complete this week.

---

## 5. One-paragraph summary for stakeholders

> "Google Forms stores every name, email and phone number in a spreadsheet anyone with the link can read. We can't enforce who sees it, where it lives, how long it stays, or whether Google staff can read it. This platform encrypts every personal field in the participant's own browser before it touches the network, stores it in Mumbai-region Firestore as opaque ciphertext, locks all reads to a named allowlist of bank operators, expires the data automatically on a per-event clock, and runs on hardened browser-security headers (HSTS preload, strict CSP, anti-clickjacking, denied device permissions). A database breach yields ciphertext. A stolen URL yields a permission-denied error. A phished password is revoked by removing one allowlist row. Known gaps — chiefly that the master key currently rides in the JS bundle, and we don't yet log every decrypt — are scoped, planned, and on a hardening roadmap (Phases B–F). None of those gaps even *exist* on the SaaS forms, because those platforms don't attempt the encryption story at all."
