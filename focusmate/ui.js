// The overlay: shadow-DOM modal with a Schedule tab and a Cancel tab.
// No styling from Focusmate reaches in, and nothing here leaks out.

window.FM = window.FM || {};

window.FM.ui = (() => {
  const W = () => window.FM.weeks;

  const CSS = `
:host, * { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(17, 16, 26, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1d1b26;
}
.panel {
  background: #fff; border-radius: 14px; width: 100%; max-width: 1300px;
  max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(17,16,26,.35);
}
header {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px; border-bottom: 1px solid #ece9f3;
}
h1 { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -.01em; }
.tabs { display: flex; gap: 4px; margin-left: 8px; }
.tab {
  border: 0; background: none; font: inherit; font-weight: 550; color: #6b6780;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
}
.tab:hover { background: #f4f2f9; color: #1d1b26; }
.tab.on { background: #efe9fe; color: #5b21b6; }
.saved { margin-left: auto; font-size: 12px; color: #8b87a0; }
.x {
  border: 0; background: none; font-size: 20px; line-height: 1; color: #8b87a0;
  cursor: pointer; padding: 4px 6px; border-radius: 6px;
}
.x:hover { background: #f4f2f9; color: #1d1b26; }
.body { padding: 20px; overflow: auto; }
.hide { display: none !important; }

/* schedule grid */
.gridwrap { overflow-x: auto; padding-bottom: 4px; }
.grid { display: flex; align-items: flex-start; gap: 0; min-width: max-content; }
.col { flex: 1 1 0; min-width: 0; }
.colhead { display: flex; align-items: center; gap: 4px; font-weight: 650;
  font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b6780;
  padding: 0 0 8px 2px; min-height: 24px; }
.units { font-size: 10px; color: #b4b0c4; font-weight: 500; letter-spacing: 0;
  text-transform: none; }
.row { display: flex; gap: 2px; margin-bottom: 6px; align-items: center; }
.row select {
  font: inherit; font-size: 12px; padding: 5px 2px 5px 4px; border: 1px solid #ded9ea;
  border-radius: 7px; background: #fff; color: inherit; flex: 0 0 auto; min-width: 0;
}
.row select.hh, .row select.mm { width: 42px; }
.row select.dur { width: 46px; margin-left: 2px; }
.colon { color: #b4b0c4; flex: 0 0 auto; font-size: 11px; }
.row.bad select { border-color: #e11d48; }
.del {
  border: 0; background: none; color: #cfcbdc; cursor: pointer; font-size: 14px;
  line-height: 1; padding: 2px 2px; border-radius: 5px; flex: 0 0 auto;
}
.del:hover { background: #fee2e6; color: #e11d48; }
.err { color: #e11d48; font-size: 11px; margin: -2px 0 6px 2px; }
.caption { font-size: 11.5px; color: #8b87a0; margin: 10px 0 0 2px; }
.add {
  border: 1px dashed #ded9ea; background: none; color: #6b6780; font: inherit;
  font-size: 12px; width: 100%; padding: 5px; border-radius: 7px; cursor: pointer;
}
.add:hover:not(:disabled) { border-color: #a78bfa; color: #5b21b6; background: #faf8ff; }
.add:disabled { opacity: .4; cursor: default; }
.copy {
  margin-left: auto; margin-right: 6px; border: 1px solid #ded9ea; background: #fff;
  border-radius: 7px; cursor: pointer; font-size: 10px; color: #6b6780;
  padding: 3px 4px; white-space: nowrap; text-transform: none; letter-spacing: 0;
  font-weight: 500;
}
.copy:hover { border-color: #a78bfa; color: #5b21b6; background: #faf8ff; }

/* lower half */
.split { display: flex; gap: 28px; margin-top: 24px; padding-top: 20px;
  border-top: 1px solid #ece9f3; align-items: flex-start; }
.split > * { flex: 1 1 0; min-width: 0; }
h2 { font-size: 12px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: #6b6780; margin: 0 0 10px; }

/* calendar */
.cal { max-width: 300px; -webkit-user-select: none; user-select: none; }
.calhead { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.calhead .m { font-weight: 600; flex: 1 1 auto; }
.nav { border: 1px solid #ded9ea; background: #fff; border-radius: 6px;
  cursor: pointer; width: 24px; height: 24px; line-height: 1; color: #6b6780; }
.nav:hover:not(:disabled) { border-color: #a78bfa; color: #5b21b6; }
.nav:disabled { opacity: .35; cursor: default; }
.dow, .wk { display: grid; grid-template-columns: repeat(7, 1fr); }
.dow div { text-align: center; font-size: 11px; color: #8b87a0; padding: 2px 0; }
.wk { border-radius: 8px; cursor: pointer; }
.wk div { text-align: center; padding: 5px 0; font-size: 13px; }
.wk:hover:not(.off) { background: #f4f2f9; }
.wk.sel { background: #efe9fe; color: #5b21b6; font-weight: 600; }
.wk.off { cursor: default; color: #c8c4d6; }
.wk.far { cursor: default; color: #c8c4d6; }
.wk.far div { text-decoration: line-through; text-decoration-thickness: 1.5px;
  text-decoration-color: #aca7bf; }
.wk .dim { color: #c8c4d6; }
.rangetext { margin-top: 8px; font-size: 13px; color: #4b475e; min-height: 19px; }
.hint { margin-top: 3px; font-size: 11.5px; color: #a5a1b5; }
.linkbtn { border: 0; background: none; font: inherit; font-size: 12px; color: #5b21b6;
  cursor: pointer; padding: 4px 0 0; text-decoration: underline; }
.wk.sel:hover:not(.off) { background: #e4daff; }
.cap { color: #e11d48; }

.note { background: #faf8ff; border: 1px solid #eee9fb; border-radius: 9px;
  padding: 10px 12px; font-size: 13px; color: #4b475e; margin-bottom: 14px; }
.note b { color: #1d1b26; font-weight: 600; }
button.go {
  border: 0; border-radius: 9px; background: #5b21b6; color: #fff; font: inherit;
  font-weight: 600; padding: 9px 18px; cursor: pointer;
}
button.go:hover:not(:disabled) { background: #4c1d95; }
button.go:disabled { background: #ded9ea; color: #8b87a0; cursor: default; }
button.go.danger { background: #e11d48; }
button.go.danger:hover:not(:disabled) { background: #be123c; }
button.go.danger:disabled { background: #ded9ea; color: #8b87a0; }
/* Armed: one more click deletes. Darker, and ringed so it reads as a different
   state rather than the same button with new words in it. */
button.go.danger.armed { background: #881337; box-shadow: 0 0 0 3px #fecdd3; }
button.go.danger.armed:hover:not(:disabled) { background: #6b0f2a; }
.out { margin-top: 14px; font-size: 13px; color: #4b475e; white-space: pre-wrap; }
.out .bad { color: #e11d48; }
.out table { border-collapse: collapse; margin-top: 8px; font-size: 12px; }
.out td { border-top: 1px solid #ece9f3; padding: 3px 10px 3px 0; }
`;

  // ---- calendar ---------------------------------------------------------

  // Month grid, Mon-first, where the unit of selection is a whole week row.
  // Selection is a SET of weeks, not a start/end range, so weeks can be punched
  // out and put back. Interaction follows the usual list convention: click
  // toggles one week, shift-click selects the run from the last week you touched.
  function makeCalendar(onChange) {
    const w = W();
    const el = document.createElement("div");
    el.className = "cal";
    const head = document.createElement("div");
    head.className = "calhead";
    const prev = document.createElement("button");
    prev.className = "nav"; prev.textContent = "\u2039";
    const next = document.createElement("button");
    next.className = "nav"; next.textContent = "\u203a";
    const label = document.createElement("div");
    label.className = "m";
    head.append(label, prev, next);
    const dow = document.createElement("div");
    dow.className = "dow";
    for (const d of w.DAYS) {
      const c = document.createElement("div");
      c.textContent = w.DAY_LABEL[d].slice(0, 2);
      dow.appendChild(c);
    }
    const weeksEl = document.createElement("div");
    const text = document.createElement("div");
    text.className = "rangetext";
    const hint = document.createElement("div");
    hint.className = "hint";
    const clear = document.createElement("button");
    clear.className = "linkbtn hide";
    clear.textContent = "Clear";
    el.append(head, dow, weeksEl, text, hint, clear);

    const firstMonday = w.mondayOf(w.startOfToday());
    // Absolute horizon: the last week Focusmate will take a booking in.
    const lastMonday = w.addDays(firstMonday, (w.MAX_WEEKS - 1) * 7);
    const today = w.startOfToday();
    // The first bookable week can start in the previous month (if today is a
    // Tuesday, its Monday may be last month), so the back limit is
    // firstMonday's month, not today's.
    const minView = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), 1);
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let selected = new Set(); // Monday date keys
    let anchor = null;        // last week clicked, for shift-click runs
    let capWarn = false;
    let capTimer = null;

    function selectable(monday) {
      return monday >= firstMonday && monday <= lastMonday;
    }

    // Sorted Monday keys of every selected week.
    function weeks() {
      return [...selected].sort();
    }

    // Keys come from stored config, so treat them as untrusted: anything that
    // isn't a real date is dropped, and anything mid-week is pulled back to its
    // Monday. An unnormalized key highlights no row yet still widens what gets
    // booked or cancelled by a week.
    function set(keys) {
      const mondays = [];
      for (const k of keys || []) {
        if (typeof k !== "string") continue;
        const d = w.parseKey(k);
        if (Number.isNaN(d.getTime())) continue;
        const m = w.mondayOf(d);
        if (selectable(m)) mondays.push(w.dateKey(m));
      }
      selected = new Set(mondays);
      const first = weeks()[0];
      if (first) {
        const d = w.parseKey(first);
        view = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      render();
    }

    function warnCap() {
      capWarn = true;
      render();
      clearTimeout(capTimer);
      // Clear itself - the selection is still valid, so don't leave a red line
      // sitting there implying something is wrong.
      capTimer = setTimeout(() => { capWarn = false; render(); }, 4000);
    }

    function pick(monday, shift) {
      capWarn = false;
      clearTimeout(capTimer);
      const key = w.dateKey(monday);
      if (shift && anchor) {
        // Shift-click fills in the run from the anchor to here, additively.
        const a = w.parseKey(anchor);
        const from = a <= monday ? a : monday;
        const to = a <= monday ? monday : a;
        for (let d = from; d <= to; d = w.addDays(d, 7)) {
          if (selectable(d)) selected.add(w.dateKey(d));
        }
      } else if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      anchor = key;
      render();
      onChange(weeks());
    }

    function render() {
      label.textContent = `${w.MONTHS[view.getMonth()]} ${view.getFullYear()}`;
      prev.disabled = view <= minView;
      next.disabled =
        view.getFullYear() === lastMonday.getFullYear() && view.getMonth() === lastMonday.getMonth();
      weeksEl.textContent = "";
      let cursor = w.mondayOf(view);
      const monthEnd = new Date(view.getFullYear(), view.getMonth() + 1, 0);
      while (cursor <= monthEnd) {
        const monday = cursor;
        const row = document.createElement("div");
        row.className = "wk";
        const past = monday < firstMonday;
        const far = monday > lastMonday;
        if (past) row.classList.add("off");
        if (far) row.classList.add("far");
        if (selected.has(w.dateKey(monday))) row.classList.add("sel");
        for (let i = 0; i < 7; i++) {
          const d = w.addDays(monday, i);
          const c = document.createElement("div");
          c.textContent = d.getDate();
          if (d.getMonth() !== view.getMonth()) c.className = "dim";
          row.appendChild(c);
        }
        if (far) row.addEventListener("click", warnCap);
        else if (!past) row.addEventListener("click", (e) => pick(monday, e.shiftKey));
        weeksEl.appendChild(row);
        cursor = w.addDays(monday, 7);
      }
      const ws = weeks();
      text.className = "rangetext" + (capWarn ? " cap" : "");
      text.textContent = capWarn
        ? `You can only book ${w.MAX_WEEKS} weeks out.`
        : ws.length ? w.fmtWeeks(ws) : "No weeks picked yet.";
      hint.textContent = "Click a week to add or remove it. Shift-click to take a run of weeks.";
      clear.classList.toggle("hide", !ws.length);
    }

    prev.addEventListener("click", () => {
      const back = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      view = back < minView ? minView : back;
      render();
    });
    next.addEventListener("click", () => {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      render();
    });
    clear.addEventListener("click", () => {
      selected.clear();
      anchor = null;
      render();
      onChange(weeks());
    });
    render();
    return { el, set, weeks };
  }

  // ---- output panel -----------------------------------------------------

  function makeOutput() {
    const el = document.createElement("div");
    el.className = "out";
    return {
      el,
      clear: () => { el.textContent = ""; },
      progress: (t) => { el.textContent = t; },
      done: (lines, failures) => {
        el.textContent = lines.join("\n");
        if (failures && failures.length) {
          const t = document.createElement("table");
          for (const f of failures) {
            const tr = document.createElement("tr");
            const a = document.createElement("td");
            a.textContent = f.when;
            const b = document.createElement("td");
            b.className = "bad";
            b.textContent = f.reason;
            tr.append(a, b);
            t.appendChild(tr);
          }
          el.appendChild(t);
        }
      },
      fail: (msg) => {
        el.textContent = "";
        const s = document.createElement("span");
        s.className = "bad";
        s.textContent = msg;
        el.appendChild(s);
      }
    };
  }

  return { CSS, makeCalendar, makeOutput };
})();
