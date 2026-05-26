// Audit log — append-only record of admin actions.
//
// Every meaningful admin action (sign-in, sign-out, event create/edit/close/
// delete/reset, CSV export, decrypt/reveal, user add/remove, key rotate)
// writes one row to /audit. Rows expire on the same 90-day TTL as event data.
//
// Storage shape:
//   {
//     id:           <auto>
//     action:       string (clear, enum below)
//     actorUid:     string (clear)            — Firebase Auth UID; useful for cross-referencing without leaking the email
//     actorEmail:   enc:v1:...                — operator email, AES-256-GCM encrypted at rest
//     target:       string|null (clear)       — eventId / userId touched (or null for global actions like sign-in)
//     targetLabel:  enc:v1:...                — human-readable label, encrypted at rest (event title, user email, etc.)
//     details:      enc:v1:...                — optional JSON-encoded extras (encrypted)
//     userAgent:    string (clear, truncated) — browser UA, useful for spotting odd devices
//     at:           Date                      — server-stamped on write
//     expiresAt:    Date                      — at + retentionDays (default 90)
//   }
//
// Reads are admin-only via Firestore rules. Writes are admin-only too (the
// platform never logs participant actions, by design — only operator
// actions are auditable). Failures here are SWALLOWED: a logging failure
// must never break the action it was logging.

import { addDoc, collection, getDocs, orderBy, query } from "firebase/firestore";

import { firestoreDb, getFirebaseMode } from "@/lib/firebase";
import { decryptString, encryptString } from "@/lib/crypto";

const AUDIT_RETENTION_DAYS = 90;
const DEMO_KEY = "scb-audit-demo-store-v1";

// Canonical action vocabulary. Use these constants at call sites so renames
// stay grep-friendly.
export const AUDIT_ACTIONS = Object.freeze({
  SIGN_IN: "sign-in",
  SIGN_OUT: "sign-out",
  EVENT_CREATE: "event-create",
  EVENT_EDIT: "event-edit",
  EVENT_CLOSE: "event-close",
  EVENT_REOPEN: "event-reopen",
  EVENT_DELETE: "event-delete",
  EVENT_RESET: "event-reset",
  CSV_EXPORT: "csv-export",
  REVEAL: "reveal",
  USER_ADD: "user-add",
  USER_REMOVE: "user-remove",
  KEY_ROTATE: "key-rotate",
});

// Friendly labels for the UI.
export const AUDIT_LABEL = Object.freeze({
  "sign-in": "Sign-in",
  "sign-out": "Sign-out",
  "event-create": "Event created",
  "event-edit": "Event edited",
  "event-close": "Event closed",
  "event-reopen": "Event reopened",
  "event-delete": "Event deleted",
  "event-reset": "Event data reset",
  "csv-export": "CSV exported",
  "reveal": "Reveal / decrypt",
  "user-add": "Admin added",
  "user-remove": "Admin removed",
  "key-rotate": "Encryption key rotated",
});

function truncatedUA() {
  if (typeof navigator === "undefined" || !navigator.userAgent) return "";
  return String(navigator.userAgent).slice(0, 180);
}

function readDemoStore() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeDemoStore(rows) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_KEY, JSON.stringify(rows));
}

// Write one row. Best-effort — failures are logged to console.error and
// swallowed; the calling action must NEVER be blocked by a logging miss.
export async function logAudit({ action, actor, target = null, targetLabel = "", details = null }) {
  try {
    if (!action || !AUDIT_LABEL[action]) {
      console.warn("[audit] unknown action:", action);
      return;
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const row = {
      action,
      actorUid: actor?.uid || "",
      actorEmail: await encryptString(actor?.email || ""),
      target: target || null,
      targetLabel: await encryptString(targetLabel || ""),
      details: details ? await encryptString(JSON.stringify(details)) : "",
      userAgent: truncatedUA(),
      at: now,
      expiresAt,
    };

    if (getFirebaseMode() === "firebase") {
      await addDoc(collection(firestoreDb, "audit"), row);
    } else {
      const store = readDemoStore();
      store.unshift({ id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...row, at: now.toISOString(), expiresAt: expiresAt.toISOString() });
      writeDemoStore(store.slice(0, 500));
    }
  } catch (error) {
    // Never throw from a logger.
    console.error("[audit] failed to write log row:", error);
  }
}

// List recent audit rows (newest first). Decrypts actorEmail + targetLabel
// on the way out so the caller doesn't see ciphertext.
export async function listAuditRows({ limit = 200 } = {}) {
  let rawRows = [];
  if (getFirebaseMode() === "firebase") {
    try {
      const snap = await getDocs(query(collection(firestoreDb, "audit"), orderBy("at", "desc")));
      rawRows = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          at: data.at?.toDate?.()?.toISOString?.() || data.at,
          expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() || data.expiresAt,
        };
      });
    } catch (error) {
      console.error("[audit] listAuditRows failed:", error);
      return [];
    }
  } else {
    rawRows = readDemoStore();
  }

  const sliced = rawRows.slice(0, limit);
  return Promise.all(
    sliced.map(async (row) => {
      let actorEmail = "";
      let targetLabel = "";
      let details = null;
      try { actorEmail = await decryptString(row.actorEmail); } catch { actorEmail = "[decrypt failed]"; }
      try { targetLabel = await decryptString(row.targetLabel); } catch { targetLabel = ""; }
      if (row.details) {
        try {
          const plain = await decryptString(row.details);
          details = plain ? JSON.parse(plain) : null;
        } catch {
          details = null;
        }
      }
      return {
        id: row.id,
        action: row.action,
        actorUid: row.actorUid,
        actorEmail,
        target: row.target,
        targetLabel,
        details,
        userAgent: row.userAgent,
        at: row.at,
      };
    }),
  );
}
