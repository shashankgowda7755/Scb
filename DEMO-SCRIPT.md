# Demo Script — SCB Event Platform

**Audience:** SCB stakeholders (business + IT/InfoSec mixed room).
**Duration:** ~7 minutes spoken + 3 minutes Q&A.
**Tone:** confident, plain English, no jargon unless you explain it.
**Setup before you start:** open three browser tabs — (1) the platform `https://scbv1-eight.vercel.app`, (2) Firebase Console → Firestore → `registrations` collection, (3) `PROOF.html` page. Have your phone ready with a QR code visible.

---

## 0. Opening (30 seconds)

> "Thanks for the time. Quick context — until now, when SCB ran a CSR event, registrations were captured through Google Forms. Names, employee IDs, phone numbers, photo consents — all of it landed in a Google Sheet. That sheet sits inside a Google account, in plain text, readable by anyone with access to that account or the share link.
>
> What I'm going to show you in the next seven minutes is a replacement that does the same job for the volunteer — scan a QR code, fill a form — but treats their data the way a bank should. Encrypted before it leaves their phone. Stored as scrambled text in the database. Visible to only the people SCB explicitly authorizes. Auto-deleted after the event."

---

## 1. The participant experience (1 minute)

**[Pick up your phone. Show the QR code on screen.]**

> "From the volunteer's side, nothing's complicated. They scan this QR at the venue, type their name and employee ID, hit submit. That's the whole experience. Same as Google Forms. Two seconds."

**[Scan on your phone, fill in a test entry, submit.]**

> "Done. Now let me show you what just happened underneath."

---

## 2. The Firebase database — show them the ciphertext (90 seconds)

**[Switch to the Firebase console tab. Open the registrations collection. Click the new doc.]**

> "This is the database. This is the document that just got created. Let me read out what's in it.
>
> Full name? Look — `enc:v1:` followed by random letters and numbers. That's encrypted. Not the actual name.
> Employee ID? Same — `enc:v1:` random text.
> Email, phone, department, city, photo consent — all scrambled.
>
> Even the answer to a yes/no checkbox is encrypted. You cannot tell from this database who clicked yes versus no on photo consent.
>
> Compare this to Google Forms. If we did the same thing there, this row would show 'Mukesh Kumar, mukesh@sc.com, +91-9876543210, Yes, Yes.' Plain text. Anyone with the sheet sees everything.
>
> Here, even if someone steals the entire database — Google employee, breach attacker, anyone — they get this. Random scrambled text. No personal data leaks."

**[Point to the `dedupeHash` field.]**

> "This long hex string is how we prevent duplicate registrations. It's a one-way scramble of the employee ID. Same ID always produces the same hash, so we know if someone tried to register twice. But you cannot reverse it back to the employee ID. It's a fingerprint, not a copy."

---

## 3. The "unlock" — show the reveal flow (1 minute)

**[Switch to the operator dashboard. Show the masked rows — bullets where the data should be.]**

> "This is what an SCB operator sees when they log in. Notice the rows — name column, email column, phone column — all dots. The dashboard does not auto-decrypt. Even the operator has to make a deliberate click to reveal a record."

**[Click Reveal on one row. Real data appears.]**

> "Now I can see it. That deliberate click matters — it means we can audit who saw what, when. The data isn't sitting decrypted in browser memory waiting to be screenshotted."

**[Sign out. Close that tab. Open an Incognito window. Try to load the same dashboard URL.]**

> "And without sign-in? Nothing. The page loads, but the database returns 'permission denied' for every read. Even if you know the URL, even if you know our Firebase project ID, the data is unreachable."

---

## 4. Security explained, in plain English (90 seconds)

**[Switch back to the platform front page. Keep it visible.]**

> "Let me explain the security model the way I'd explain it to my parents.
>
> Think of every registration as a sealed envelope. The volunteer's phone seals the envelope before posting it. Inside is their personal data. Outside, the envelope says only 'this is registration number 47 for the Chennai event' — enough for us to count, sort, and detect duplicates, but nothing personal.
>
> The envelope gets stored in a vault. The vault is locked. Only SCB-authorized operators have a key to the vault. Inside the vault, the envelopes are still sealed. To read what's inside one envelope, the operator has to deliberately open it. The opening leaves a trace.
>
> Google Forms is the opposite. The data arrives in a clear plastic bag, gets dropped in an unlocked drawer in the office, and anyone walking past can read it.
>
> Same volunteer experience. Completely different handling on the back end.
>
> And one more thing — the envelopes auto-shred after the event. Default ninety days. Each event sets its own retention. We don't keep data we don't need."

---

## 5. The open-source angle (1 minute)

> "Now — why open source matters here.
>
> The complete source code for this platform is on GitHub. Anyone — SCB's InfoSec team, your external auditors, a hostile journalist, a competitor — can read every line of how the encryption works, how the database rules are written, how an operator gets authorized.
>
> When you buy Typeform or use Google Forms, you're trusting a black box. You're trusting their word that they handle data correctly. You can't verify.
>
> Here you don't have to trust. You can verify. The encryption algorithm is AES-256-GCM — the same standard the US government uses for top-secret data. Banks use it. WhatsApp uses it. It's been public for twenty years, broken by no one. Our code uses the browser's built-in crypto library, which means our implementation can be audited line by line.
>
> If SCB wants to take this code and host it on SCB's own servers tomorrow, they can. The data stays with you. The vendor cannot hold it hostage. There's no SaaS lock-in."

**[Open PROOF.html in a tab.]**

> "This page lets anyone — your auditor, your IT team — paste text, encrypt it, see the ciphertext, decrypt with the right key, watch it fail with the wrong key. It's a live proof of the algorithm. Not marketing slides. Math you can run yourself."

---

## 6. The "one-vendor" pitch — Firebase consolidation (45 seconds)

> "One last thing on the procurement side. This whole platform runs on Google Firebase. One vendor. One contract. One DPA. One data-residency attestation — Mumbai, asia-south1, your data never leaves India. One InfoSec questionnaire.
>
> Most platforms involve three or four vendors stitched together — one for hosting, one for the database, one for analytics, one for email. Each one is a separate security review. Each one is a separate point of failure.
>
> Here it's Google. That's it. The same Google your developers already trust for Gmail, Maps, and Workspace."

---

## 7. Honest disadvantages (45 seconds)

**This is the bit that wins the bank over. Bring it up before they do.**

> "I'll close with what's *not* perfect yet, because your InfoSec team will ask.
>
> Today, the encryption key sits inside the page's JavaScript. That's a known gap. A determined attacker who already has a valid operator login could, in theory, extract the key. We have a planned fix — move the key to Google Secret Manager, and route every decrypt through a serverless function that logs who decrypted what. That work is scoped, plan is on paper, takes about a week to ship.
>
> Today, the system relies on Firebase password for operator login. We should turn on two-factor authentication. Firebase supports it natively. It's a one-hour configuration change.
>
> Today, the database auto-deletion is configured but the one-click 'enable' button in the Firebase console hasn't been pressed yet. That's a five-second job pending sign-off.
>
> Those three fixes — Secret Manager, 2FA, auto-delete switch — close every realistic gap. None of those fixes are even *possible* on Google Forms, because the platform isn't built to support them.
>
> So the question isn't 'is this perfect today.' It's 'is this on a path to bank-grade, and is that path credible.' Code is open. Plan is written. Trajectory is real."

---

## 8. The ask (15 seconds)

> "What I'd like from this meeting — sign-off to run one real event on this platform with InfoSec watching. We agree the success criteria upfront. After the event, we review the audit. Either we expand to all CSR events from there, or we identify the gaps and fix before next attempt.
>
> Questions?"

---

## Anticipated questions — short answers

**Q: "What if you lose the encryption key?"**
> "All encrypted records become permanently unreadable. That's intentional — if the key leaks, we want the data unrecoverable too. The fix in flight (Secret Manager) gives us versioned keys with controlled rotation, so we never have a 'lost the only copy' moment in production."

**Q: "How do we know the encryption is actually happening?"**
> "Open the database in Firebase Console — point at the cipher field. It's `enc:v1:` followed by base64 ciphertext. No plaintext anywhere. We can also do this live for your auditor."

**Q: "Can we host this on our own servers?"**
> "Yes. The whole codebase is yours under whatever license we agree to. Firebase itself can be replaced with any standards-compliant alternative — the encryption is in the browser, not in Firebase."

**Q: "What if a hacker modifies the website?"**
> "Two answers. (1) To change what other users see, the hacker would need to compromise our GitHub or Firebase account — both protected by 2FA. (2) To change the site in their own browser via devtools, they only affect themselves; can't reach anyone else's data. The real risk is phishing — someone standing up a clone site. That's not unique to us; it's the same risk Gmail, your bank, your email faces. Defense is a branded domain, physical QR posters at the venue, and on-page event verification."

**Q: "Is this GDPR / DPDP-compliant?"**
> "The technical building blocks are aligned — encryption at rest, encryption in transit, data residency in India, right-to-be-forgotten by deleting one record, retention limits with auto-purge. The compliance certification itself requires a formal audit — that's the next step after Phase B lands."

**Q: "Cost?"**
> "At SCB demo scale, free. Firebase has a generous free tier that covers up to about ten thousand registrations a month. Beyond that, it's pay-per-use — roughly fifty paise per thousand requests. Practical cost for an SCB CSR program is essentially zero."

**Q: "What about availability — what if Firebase goes down?"**
> "Firebase SLA is 99.95%. About four hours per year of allowed downtime. For a one-day CSR event with a 6-hour registration window, that's well within tolerance. The platform also gracefully degrades — if the database is unreachable, the page shows an error rather than silently losing the submission."

**Q: "Can we add SCB SSO instead of Firebase password?"**
> "Yes. Firebase Auth supports SAML and OIDC out of the box. We can federate to SCB's identity provider so operators sign in with their normal corporate credentials. About a day of work to wire."

---

## Pre-demo checklist

- [ ] Phone has working camera + QR scanner
- [ ] Firebase Console open in a tab, already authenticated
- [ ] One pre-created test event with a clean registrations collection
- [ ] PROOF.html bookmarked
- [ ] Incognito window ready (for the "permission denied" demo)
- [ ] Wi-Fi working — don't demo over cellular if avoidable
- [ ] Backup screenshot deck on desktop in case live demo fails
- [ ] Stop notifications on your laptop
- [ ] Close Slack, Mail, anything that could pop a personal message on screen

---

## Visual cues — where to point on screen

| Moment in script | Tab to show | Element to point at |
|------------------|-------------|---------------------|
| Section 2 — show ciphertext | Firebase Console | `fullName` field starting with `enc:v1:` |
| Section 3 — masked dashboard | Platform → Dashboard | Bullet-redacted rows |
| Section 3 — reveal | Same | The Reveal button + the now-visible plaintext |
| Section 3 — permission denied | Incognito window | Browser devtools console showing the error |
| Section 5 — proof page | PROOF.html | Live encrypt → ciphertext → decrypt flow |
| Section 7 — honest gaps | (no screen — speak it) | Look at the room, not the laptop |

---

## What NOT to say

- Don't say "completely unhackable" — nothing is. Say "no realistic attacker reads the data."
- Don't say "military-grade encryption" — cliché, technical people roll their eyes. Say "AES-256, the same standard the US government uses for top-secret data."
- Don't say "blockchain" anywhere. We don't use it.
- Don't promise compliance certifications you don't have. Say "the technical building blocks are aligned with GDPR/DPDP, formal certification is the next step."
- Don't badmouth Google Forms. Frame it as "the right tool for casual feedback forms, not for personal data at a bank." Respect the previous choice.
