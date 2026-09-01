// Focusmate API access. Runs in the page's isolated world on app.focusmate.com.
//
// Every behaviour noted below was observed directly against the live API, not
// inferred from the client:
//  - Auth token lives in the page origin's IndexedDB, sent as a BARE JWT (no "Bearer").
//  - Book with userId:"" - Focusmate matches you with a partner later, so there is
//    no GET-and-match step against other users' offers.
//  - The booking POST returns HTTP 200 even when individual sessions fail. Success =
//    no `error` AND an `externalId`. Conflicts come back with error_code 7 and are
//    simply skipped. A request rejected outright answers 400 with an object instead
//    of the per-session array (error_code 39 = too many sessions in one request).
//  - Conflicts are by interval OVERLAP, not exact timestamp.
//  - Cancels are NOT batched (one DELETE each), so they are paced.

window.FM = window.FM || {};

window.FM.api = (() => {
  const API = "https://api.focusmate.com";

  // ---- auth -------------------------------------------------------------

  function openAuthDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("firebaseLocalStorageDb");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function readAuthRecord() {
    const db = await openAuthDb();
    const all = await new Promise((res, rej) => {
      const r = db
        .transaction("firebaseLocalStorage", "readonly")
        .objectStore("firebaseLocalStorage")
        .getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const entry = all.find((e) => e.value && e.value.stsTokenManager);
    if (!entry) throw new Error("Not logged in to Focusmate (no auth token found).");
    return entry.value;
  }

  // A token we refreshed ourselves. Held in memory only, so a long run does not
  // re-refresh on every call, and we never write back into the page's own auth
  // store (that belongs to Firebase).
  let refreshed = null; // { token, expiresAt }

  // Returns a valid access token, refreshing via Firebase if it's near expiry.
  // `force` skips every cached path - callers use it after a 401, where the
  // token they hold is known bad no matter what its expiry claims.
  async function getToken(force) {
    const soon = Date.now() + 2 * 60 * 1000;
    if (force) refreshed = null;
    else if (refreshed && refreshed.expiresAt > soon) return refreshed.token;

    const v = await readAuthRecord();
    const m = v.stsTokenManager;
    if (!force && m.accessToken && m.expirationTime && m.expirationTime > soon) {
      return m.accessToken;
    }

    let r = null;
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: m.refreshToken
      });
      r = await fetch(
        "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(v.apiKey),
        { method: "POST", body }
      );
    } catch (e) {
      r = null; // offline or blocked - fall through to the stored token
    }
    if (r && r.ok) {
      const j = await r.json();
      if (j && j.access_token) {
        refreshed = {
          token: j.access_token,
          expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000
        };
        return refreshed.token;
      }
    }

    // Refresh failed. The stored token can still have a minute or two on it, so
    // it is worth a try - but if it is provably dead, say so rather than hand
    // back a token that guarantees another 401 and a silent retry loop. No
    // expiry recorded counts as "unknown", not "dead".
    if (m.accessToken && (!m.expirationTime || m.expirationTime > Date.now())) {
      return m.accessToken;
    }
    throw new Error("401");
  }

  function authHeaders(token) {
    // Bare token, no "Bearer" (verified: "Bearer <t>" returns 401 code 71).
    return {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*"
    };
  }

  // ---- reads ------------------------------------------------------------

  // Every session you currently hold, as { id, startMs, endMs, blockedUntil }.
  // `blockedUntil` is the footprint - the session plus the break Focusmate adds
  // after it - which is what actually stops the next booking. Cancelled sessions
  // are dropped from this endpoint entirely (verified), so no state filtering.
  async function fetchBookings(token) {
    const r = await fetch(API + "/v1/meetings/bookings", { headers: authHeaders(token) });
    if (r.status === 401) throw new Error("401");
    const j = await r.json();
    return ((j && j.meetings) || [])
      .filter((e) => e.startMs && e.durationMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        endMs: e.startMs + e.durationMs,
        blockedUntil:
          e.startMs + window.FM.weeks.footprint(Math.round(e.durationMs / 60000)) * 60000
      }))
      .sort((a, b) => a.startMs - b.startMs);
  }

  // ---- booking ----------------------------------------------------------

  function bookBody(sessions) {
    return {
      bookData: {
        sessions: sessions.map((s) => ({
          sessionTime: s.sessionTime,
          userAvailabilityCode: "",
          duration: s.duration,
          userId: "",
          title: "",
          preferences: {
            favorites: { value: "noPreference" },
            quietMode: { value: false }
          },
          activityType: 100
        }))
      }
    };
  }

  async function bookBatch(token, sessions) {
    const r = await fetch(API + "/v1/session/", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(bookBody(sessions))
    });
    if (r.status === 401) throw new Error("401");
    const arr = await r.json().catch(() => null); // one element per requested session

    // A rejected request answers with an object, not the per-session array. The
    // one worth naming is error_code 39 - "Too many sessions in one request".
    // Focusmate does not publish the cap, so the caller halves and retries.
    if (!r.ok || !Array.isArray(arr)) {
      if (arr && arr.error_code === 39) throw new Error("TOO_MANY");
      const why =
        (arr && (arr.error_message || arr.error_desc)) || `Focusmate returned HTTP ${r.status}`;
      throw new Error(why);
    }
    const booked = [];
    const conflicts = [];
    const errors = [];
    arr.forEach((el, i) => {
      const req = sessions[i];
      if (el && !el.error && el.externalId) {
        booked.push({ ...req, externalId: el.externalId });
      } else if (el && el.error && el.error.error_code === 7) {
        conflicts.push(req);
      } else {
        errors.push({ req, reason: (el && el.error && el.error.error_message) || "unknown" });
      }
    });
    return { booked, conflicts, errors };
  }

  // Mirror the real UI: after a successful booking, register the external ids.
  // Best-effort - the booking itself succeeds without it.
  async function registerExternalIds(token, externalIds) {
    if (!externalIds.length) return;
    try {
      const r = await fetch(API + "/v1/session/external-ids", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ externalIds })
      });
      console.log(`[FM] external-ids: ${externalIds.length} id(s), HTTP ${r.status}`);
    } catch (e) {
      console.warn("[FM] external-ids call failed:", e);
    }
  }

  // ---- cancelling -------------------------------------------------------

  async function cancelOne(token, id) {
    return fetch(API + "/v1/session/" + encodeURIComponent(id) + "?source=calendarTile", {
      method: "DELETE",
      headers: authHeaders(token)
    });
  }

  return { getToken, fetchBookings, bookBatch, registerExternalIds, cancelOne };
})();
