// Wiring: mounts the overlay, keeps the schedule saved, runs booking and cancelling.

(() => {
  if (window.__fmSchedulerLoaded) return;
  window.__fmSchedulerLoaded = true;

  const api = window.FM.api;
  const store = window.FM.store;
  const w = window.FM.weeks;
  const ui = window.FM.ui;

  const WEEK_DELAY_MS = 1000;  // polite pause between weekly booking batches
  const DELETE_DELAY_MS = 350; // cancels are one request each, so pace them
  const PREVIEW_DELAY_MS = 250; // collapse a burst of week clicks into one check
  const MAX_ROWS = 10;
  const MAX_CHUNK = 30;        // sessions per booking POST, halved on error_code 39
  const CONFIRM_MS = 5000;   // an armed cancel disarms itself after this

  let host = null;
  let refs = null;
  let cfg = null;
  let saveTimer = null;
  let busy = false; // a run is in flight

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "FM_OPEN") open();
  });

  // ---- mounting ---------------------------------------------------------

  async function open() {
    if (host) {
      refs.backdrop.classList.remove("hide");
      // Anything could have happened to the calendar while this was closed -
      // sessions booked or cancelled in another tab, or by the site itself. The
      // targets behind the delete button are stale until proven otherwise, so
      // disarm and re-check rather than reopening onto a live red button.
      queueCancelPreview();
      return;
    }
    cfg = await store.load();
    build();
  }

  function close() {
    if (busy) return;
    refs.backdrop.classList.add("hide");
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    host = el("div");
    host.id = "fm-scheduler-root";
    // Closed: page script on app.focusmate.com cannot reach in through
    // `.shadowRoot` and read the schedule template, which otherwise exists only
    // in extension storage and never on this origin. Isolated worlds get their
    // own DOM bindings, so the page cannot pre-patch attachShadow to defeat it.
    const shadow = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = ui.CSS;

    const backdrop = el("div", "backdrop");
    const panel = el("div", "panel");
    const header = el("header");
    const title = el("h1", null, "Focusmate Scheduler");
    const tabs = el("div", "tabs");
    const tabSchedule = el("button", "tab on", "Schedule");
    const tabCancel = el("button", "tab", "Cancel");
    tabs.append(tabSchedule, tabCancel);
    const saved = el("div", "saved", "");
    const x = el("button", "x", "×");
    header.append(title, tabs, saved, x);

    const bodySchedule = el("div", "body");
    const bodyCancel = el("div", "body hide");
    panel.append(header, bodySchedule, bodyCancel);
    backdrop.appendChild(panel);
    shadow.append(style, backdrop);
    document.body.appendChild(host);

    refs = { backdrop, saved, bodySchedule, bodyCancel, tabSchedule, tabCancel };

    buildScheduleTab(bodySchedule);
    buildCancelTab(bodyCancel);

    x.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && host && !refs.backdrop.classList.contains("hide")) close();
    });
    tabSchedule.addEventListener("click", () => showTab("schedule"));
    tabCancel.addEventListener("click", () => showTab("cancel"));
  }

  function showTab(which) {
    const onSchedule = which === "schedule";
    refs.tabSchedule.classList.toggle("on", onSchedule);
    refs.tabCancel.classList.toggle("on", !onSchedule);
    refs.bodySchedule.classList.toggle("hide", !onSchedule);
    refs.bodyCancel.classList.toggle("hide", onSchedule);
    if (!onSchedule) {
      // The cancel calendar is seeded once, at mount. Don't re-seed here: an
      // empty selection means the user cleared it, and a destructive pick must
      // not come back on its own.
      refreshCancelPreview();
    }
  }

  // ---- schedule tab -----------------------------------------------------

  function buildScheduleTab(body) {
    // Seven columns need room; in a narrow window the grid scrolls sideways
    // rather than collapsing into itself.
    const gridwrap = el("div", "gridwrap");
    const grid = el("div", "grid");
    const cols = {};

    w.DAYS.forEach((day, i) => {
      const col = el("div", "col");
      const head = el("div", "colhead", w.DAY_LABEL[day]);
      const units = el("span", "units hide", "hh : mm  min");
      head.appendChild(units);
      col.appendChild(head);
      // `copy →` sits in the header of the day it copies FROM, so the button is
      // attached to the thing it acts on rather than floating between columns.
      if (i < w.DAYS.length - 1) {
        const to = w.DAYS[i + 1];
        const copy = el("button", "copy", "copy →");
        copy.title = `Copy ${w.DAY_LABEL[day]} into ${w.DAY_LABEL[to]}`;
        copy.addEventListener("click", () => {
          cfg.schedule[to] = cfg.schedule[day].map((r) => ({ ...r }));
          renderDay(to);
          commit();
        });
        head.appendChild(copy);
      }
      const rows = el("div");
      const add = el("button", "add", "+ add");
      add.addEventListener("click", () => {
        if (cfg.schedule[day].length >= MAX_ROWS) return;
        cfg.schedule[day].push({ time: "09:00", minutes: 50 });
        renderDay(day);
        commit();
      });
      col.append(rows, add);
      cols[day] = { rows, add, units };
      grid.appendChild(col);
    });

    const note = el("div", "note");
    note.innerHTML =
      "<b>Already have a session booked in one of these slots?</b> It stays exactly as it is. " +
      "Booking only adds what's missing - it never touches, moves or double-books an existing session.";

    const caption = el("div", "caption",
      "Focusmate blocks 30 / 60 / 90 minutes for a 25 / 50 / 75 minute session - " +
      "the session plus its break. The next one can only start after that, on a 15-minute step.");

    const split = el("div", "split");
    const left = el("div");
    left.appendChild(el("h2", null, "Weeks to book"));
    const cal = ui.makeCalendar((ws) => { cfg.lastWeeks = ws; commit(); validate(); });
    left.appendChild(cal.el);
    const right = el("div");
    right.appendChild(el("h2", null, "Book"));
    right.appendChild(note);
    const book = el("button", "go", "Book my sessions");
    const out = ui.makeOutput();
    right.append(book, out.el);
    split.append(left, right);

    gridwrap.appendChild(grid);
    body.append(gridwrap, caption, split);
    refs.cols = cols;
    refs.bookBtn = book;
    refs.bookCal = cal;
    refs.bookOut = out;

    cal.set(cfg.lastWeeks);
    for (const day of w.DAYS) renderDay(day);
    validate();
    book.addEventListener("click", runBooking);
  }

  function renderDay(day) {
    const { rows, add } = refs.cols[day];
    rows.textContent = "";
    cfg.schedule[day].forEach((row, i) => {
      const r = el("div", "row");
      const [rh, rm] = String(row.time || "").split(":");
      const hh = el("select", "hh");
      for (const h of w.HOURS) {
        const o = el("option", null, String(h).padStart(2, "0"));
        o.value = String(h).padStart(2, "0");
        if (o.value === rh) o.selected = true;
        hh.appendChild(o);
      }
      const colon = el("span", "colon", ":");
      const mm = el("select", "mm");
      // 15-minute steps only - Focusmate takes nothing else. A stored oddity
      // (from an older config) stays visible rather than being silently snapped.
      const steps = w.STEPS.map((n) => String(n).padStart(2, "0"));
      if (rm && !steps.includes(rm)) steps.push(rm);
      for (const m of steps) {
        const o = el("option", null, m);
        o.value = m;
        if (m === rm) o.selected = true;
        mm.appendChild(o);
      }
      const dur = el("select", "dur");
      for (const m of w.DURATIONS) {
        const o = el("option", null, String(m));
        o.value = String(m);
        if (m === row.minutes) o.selected = true;
        dur.appendChild(o);
      }
      const del = el("button", "del", "×");
      del.title = "Remove";
      const setTime = () => { row.time = `${hh.value}:${mm.value}`; commit(); };
      hh.addEventListener("change", setTime);
      mm.addEventListener("change", setTime);
      dur.addEventListener("change", () => { row.minutes = Number(dur.value); commit(); });
      del.addEventListener("click", () => {
        cfg.schedule[day].splice(i, 1);
        renderDay(day);
        commit();
      });
      r.append(hh, colon, mm, dur, del);
      rows.appendChild(r);
      const err = el("div", "err hide");
      rows.appendChild(err);
      r.__err = err;
    });
    // The column headings only need units once there is something to label.
    refs.cols[day].units.classList.toggle("hide", cfg.schedule[day].length === 0);
    add.disabled = cfg.schedule[day].length >= MAX_ROWS;
    validate();
  }

  // Save (debounced) + revalidate after any edit.
  function commit() {
    validate();
    refs.saved.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await store.save(cfg);
      refs.saved.textContent = "Saved";
      setTimeout(() => { if (refs.saved.textContent === "Saved") refs.saved.textContent = ""; }, 2000);
    }, 300);
  }

  function validate() {
    const problems = w.scheduleProblems(cfg.schedule);
    for (const day of w.DAYS) {
      const rowEls = [...refs.cols[day].rows.querySelectorAll(".row")];
      rowEls.forEach((r, i) => {
        const msg = problems[day] && problems[day][i];
        r.classList.toggle("bad", !!msg);
        r.__err.classList.toggle("hide", !msg);
        r.__err.textContent = msg || "";
      });
    }
    const ok = !Object.keys(problems).length && w.rowCount(cfg.schedule) > 0 &&
      refs.bookCal.weeks().length > 0;
    refs.bookBtn.disabled = !ok || busy;
    return ok;
  }

  // ---- booking ----------------------------------------------------------

  function overlapsAny(t, dur, intervals) {
    const end = t + dur;
    for (const [s, e] of intervals) if (t < e && end > s) return true;
    return false;
  }

  async function runBooking() {
    if (!validate()) return;
    const picked = refs.bookCal.weeks();
    const out = refs.bookOut;
    setBusy(true);
    out.progress("Reading your existing sessions…");
    try {
      let token = await api.getToken();
      const held = await api.fetchBookings(token);
      const intervals = held.map((b) => [b.startMs, b.blockedUntil]);

      const wanted = w.expandWeeks(cfg.schedule, picked);
      // Skip anything already held, and anything overlapping a slot picked
      // earlier in this same run.
      const toBook = [];
      for (const s of wanted) {
        // Compare on footprints - the break after a session blocks the next slot.
        if (overlapsAny(s.sessionTime, s.span, intervals)) continue;
        toBook.push(s);
        intervals.push([s.sessionTime, s.sessionTime + s.span]);
      }
      const skipped = wanted.length - toBook.length;

      if (!toBook.length) {
        out.done([
          `Nothing to book - all ${wanted.length} session${wanted.length === 1 ? "" : "s"} in ${w.fmtWeeks(picked)} are already on your calendar.`
        ]);
        return;
      }

      // One POST per week, mirroring the site.
      const byWeek = new Map();
      for (const s of toBook) {
        const k = w.dateKey(w.mondayOf(new Date(s.sessionTime)));
        if (!byWeek.has(k)) byWeek.set(k, []);
        byWeek.get(k).push(s);
      }
      const keys = [...byWeek.keys()].sort();

      let booked = 0, conflicts = 0;
      const failures = [];
      // Focusmate caps how many sessions one POST may carry and will not say what
      // the cap is - over it, the whole request is rejected with error_code 39. So
      // start at MAX_CHUNK, halve on rejection, and keep whatever size worked for
      // the rest of the run.
      let chunkSize = MAX_CHUNK;
      let first = true;
      for (let i = 0; i < keys.length; i++) {
        const batch = byWeek.get(keys[i]);
        let pos = 0;
        let retried401 = false;
        while (pos < batch.length) {
          out.progress(`Booking week ${i + 1} of ${keys.length}…`);
          const chunk = batch.slice(pos, pos + chunkSize);
          if (!first) await sleep(WEEK_DELAY_MS);
          first = false;
          let res;
          try {
            res = await api.bookBatch(token, chunk);
          } catch (e) {
            if (e.message === "401" && !retried401) {
              retried401 = true;
              token = await api.getToken(true); // token died mid-run - force a refresh
              continue; // same chunk, fresh token
            }
            if (e.message === "TOO_MANY" && chunkSize > 1) {
              chunkSize = Math.floor(chunkSize / 2);
              console.log(`[FM] batch too large, retrying at ${chunkSize} per request`);
              continue; // same position, smaller bite
            }
            throw e;
          }
          retried401 = false;
          booked += res.booked.length;
          conflicts += res.conflicts.length;
          for (const f of res.errors) {
            failures.push({ when: new Date(f.req.sessionTime).toLocaleString(), reason: f.reason });
          }
          await api.registerExternalIds(token, res.booked.map((b) => b.externalId));
          pos += chunk.length;
        }
      }

      out.done([
        `Booked ${booked} session${booked === 1 ? "" : "s"} across ${w.fmtWeeks(picked)}.`,
        `Already on your calendar, left alone: ${skipped + conflicts}`,
        `Failed: ${failures.length}`
      ], failures);
    } catch (e) {
      out.fail(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- cancel tab -------------------------------------------------------

  function buildCancelTab(body) {
    const split = el("div", "split");
    split.style.marginTop = "0";
    split.style.borderTop = "0";
    split.style.paddingTop = "0";

    const left = el("div");
    left.appendChild(el("h2", null, "Weeks to cancel"));
    const cal = ui.makeCalendar(() => queueCancelPreview());
    left.appendChild(cal.el);

    const right = el("div");
    right.appendChild(el("h2", null, "Cancel"));
    const note = el("div", "note");
    note.innerHTML =
      "This cancels <b>every</b> Focusmate session you hold inside the weeks you pick, " +
      "whether this extension booked it or not. Weeks you didn't pick are untouched. " +
      "Cancelling can't be undone - you'd have to book again.";
    const preview = el("div", null, "Pick some weeks to see what would be cancelled.");
    preview.style.margin = "0 0 14px";
    const btn = el("button", "go danger", "Cancel sessions");
    btn.disabled = true;
    const out = ui.makeOutput();
    right.append(note, preview, btn, out.el);

    split.append(left, right);
    body.appendChild(split);

    refs.cancelCal = cal;
    refs.cancelPreview = preview;
    refs.cancelBtn = btn;
    refs.cancelOut = out;
    refs.cancelTargets = [];
    cal.set(cfg.lastWeeks);
    btn.addEventListener("click", runCancel);
  }

  // Bumped on every preview request. An in-flight check that finds the counter
  // moved on has been superseded and must not touch the button - otherwise a
  // slow fetch can arm the delete for a selection the user already dropped.
  let previewGen = 0;
  let previewTimer = null;

  // Cancelling cannot be undone, so the button takes two clicks: the first only
  // states what the second will do. Anything that changes the targets disarms it.
  let cancelArmed = false;
  let cancelArmTimer = null;

  function cancelLabel() {
    const n = refs.cancelTargets.length;
    if (!n) return "Cancel sessions";
    const s = `${n} session${n === 1 ? "" : "s"}`;
    return cancelArmed ? `Click again to cancel ${s}` : `Cancel ${s}`;
  }

  function disarmCancel() {
    cancelArmed = false;
    clearTimeout(cancelArmTimer);
    if (!refs || !refs.cancelBtn) return;
    refs.cancelBtn.classList.remove("armed");
    refs.cancelBtn.textContent = cancelLabel();
  }

  // Called on every week click. Disarms the button NOW and only defers the
  // network part; deferring the disarm too would leave the old targets live
  // behind a red button for the length of the debounce.
  function queueCancelPreview() {
    if (!refs.cancelCal || busy) return;
    previewGen++;
    clearTimeout(previewTimer);
    refs.cancelOut.clear();
    refs.cancelTargets = [];
    refs.cancelBtn.disabled = true;
    disarmCancel();
    refs.cancelPreview.textContent = refs.cancelCal.weeks().length
      ? "Checking…"
      : "Pick some weeks to see what would be cancelled.";
    previewTimer = setTimeout(() => refreshCancelPreview(), PREVIEW_DELAY_MS);
  }

  async function refreshCancelPreview(keepOutput) {
    if (!refs.cancelCal) return;
    const gen = ++previewGen;
    clearTimeout(previewTimer);
    const picked = refs.cancelCal.weeks();
    if (!keepOutput) refs.cancelOut.clear();
    refs.cancelTargets = [];
    refs.cancelBtn.disabled = true;
    disarmCancel();
    if (!picked.length) {
      refs.cancelPreview.textContent = "Pick some weeks to see what would be cancelled.";
      return;
    }
    refs.cancelPreview.textContent = "Checking…";
    try {
      const token = await api.getToken();
      if (gen !== previewGen) return;
      const held = await api.fetchBookings(token);
      if (gen !== previewGen) return;
      // A session counts if it falls inside any picked week.
      const windows = picked.map((k) => {
        const m = w.parseKey(k);
        return [m.getTime(), w.addDays(m, 7).getTime()];
      });
      const now = Date.now();
      const targets = held.filter(
        (b) => b.startMs > now && windows.some(([a, z]) => b.startMs >= a && b.startMs < z)
      );
      refs.cancelTargets = targets;
      refs.cancelBtn.disabled = busy || !targets.length;
      refs.cancelBtn.textContent = cancelLabel();
      refs.cancelPreview.textContent = targets.length
        ? `${targets.length} session${targets.length === 1 ? "" : "s"} in ${w.fmtWeeks(picked)} will be cancelled.`
        : `No upcoming sessions in ${w.fmtWeeks(picked)}.`;
    } catch (e) {
      if (gen !== previewGen) return;
      refs.cancelPreview.textContent = "";
      refs.cancelOut.fail(errorText(e));
    }
  }

  async function runCancel() {
    const targets = refs.cancelTargets;
    if (!targets.length) return;

    // First click only arms. Nothing is deleted until the second one.
    if (!cancelArmed) {
      cancelArmed = true;
      refs.cancelBtn.classList.add("armed");
      refs.cancelBtn.textContent = cancelLabel();
      clearTimeout(cancelArmTimer);
      // Disarm on its own - an armed delete left sitting there is a trap for
      // whatever the next click happens to be.
      cancelArmTimer = setTimeout(disarmCancel, CONFIRM_MS);
      return;
    }
    disarmCancel();

    const out = refs.cancelOut;
    setBusy(true);
    try {
      let token = await api.getToken();
      let done = 0;
      const failures = [];
      for (let i = 0; i < targets.length; i++) {
        out.progress(`Cancelling ${i + 1} of ${targets.length}…`);
        const t = targets[i];
        try {
          let r = await api.cancelOne(token, t.id);
          if (r.status === 401) {
            token = await api.getToken(true); // known bad, force a refresh
            r = await api.cancelOne(token, t.id);
          }
          if (r.ok) done++;
          else failures.push({ when: new Date(t.startMs).toLocaleString(), reason: `HTTP ${r.status}` });
        } catch (e) {
          // Auth is gone for good - the remaining deletes would all fail the
          // same way, so stop and report it once instead of 40 times.
          if (e && e.message === "401") throw e;
          failures.push({ when: new Date(t.startMs).toLocaleString(), reason: String(e.message || e) });
        }
        if (i < targets.length - 1) await sleep(DELETE_DELAY_MS);
      }
      out.done([`Cancelled ${done}.`, `Failed: ${failures.length}`], failures);
    } catch (e) {
      out.fail(errorText(e));
    } finally {
      setBusy(false);
      await refreshCancelPreview(true);
    }
  }

  // ---- shared -----------------------------------------------------------

  function setBusy(v) {
    busy = v;
    if (v) disarmCancel();
    refs.bookBtn.disabled = v || !validate();
    refs.cancelBtn.disabled = v || !refs.cancelTargets.length;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function errorText(e) {
    const m = (e && e.message) || String(e);
    // A missing auth store means the same thing to the user as a 401.
    if (m === "401" || /not logged in/i.test(m) || /object stores was not found/i.test(m)) {
      return "Focusmate says you're not signed in. Reload this page and try again.";
    }
    return "Something went wrong: " + m;
  }
})();
