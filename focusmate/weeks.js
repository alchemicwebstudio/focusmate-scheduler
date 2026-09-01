// Week/date maths and schedule expansion.
//
// Dates are handled as local wall-clock "YYYY-MM-DD" keys and rebuilt with the
// local Date constructor, never as epoch + fixed offsets. That is what keeps
// booking correct across a DST change inside the booked range.

window.FM = window.FM || {};

window.FM.weeks = (() => {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_LABEL = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun"
  };
  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  const MAX_WEEKS = 13;
  const DURATIONS = [25, 50, 75];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const STEPS = [0, 15, 30, 45]; // Focusmate only starts sessions on a 15-min step

  // What a session actually occupies on your calendar. Focusmate pads each one
  // with a break, and the next session can only start on the following slot:
  //   25m -> 30, 50m -> 60, 75m -> 90.
  // So a 75m session at 05:00 blocks 06:15 as well - the next bookable start is 06:30.
  const FOOTPRINT = { 25: 30, 50: 60, 75: 90 };
  function footprint(minutes) {
    return FOOTPRINT[minutes] || Math.ceil(minutes / 30) * 30;
  }

  const pad = (n) => String(n).padStart(2, "0");

  // "YYYY-MM-DD" in LOCAL time (toISOString would shift by the UTC offset).
  function dateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + n);
    return c;
  }

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  // Monday of the week containing d (weeks run Mon..Sun).
  function mondayOf(d) {
    const dow = (d.getDay() + 6) % 7; // Mon = 0
    return addDays(d, -dow);
  }

  function dayName(d) {
    return DAYS[(d.getDay() + 6) % 7];
  }

  // Whole weeks between two Mondays, inclusive of both. 1 = same week.
  function weekSpan(mondayA, mondayB) {
    const ms = parseKey(dateKey(mondayB)).getTime() - parseKey(dateKey(mondayA)).getTime();
    return Math.round(ms / (7 * 86400000)) + 1;
  }

  function fmtDay(d) {
    return `${DAY_LABEL[dayName(d)]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  }

  // A selection is a sorted list of Monday keys, which may have gaps in it.
  // Consecutive weeks collapse into runs and every run is named, so the text
  // never claims a week the selection doesn't hold. This is the confirmation
  // line for an unrecoverable bulk cancel - a first-to-last span would name
  // weeks that are not going to be touched.
  function fmtWeeks(keys) {
    if (!keys || !keys.length) return "";
    const runs = [];
    for (const k of keys) {
      const m = parseKey(k);
      const last = runs[runs.length - 1];
      if (last && weekSpan(last[1], m) === 2) last[1] = m;
      else runs.push([m, m]);
    }
    const spans = runs.map(([a, b]) => `${fmtDay(a)} - ${fmtDay(addDays(b, 6))}`);
    return `${keys.length} week${keys.length === 1 ? "" : "s"}: ${spans.join(", ")}`;
  }

  // ---- row validation ---------------------------------------------------

  function hhmm(mins) {
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }

  function toMinutes(time) {
    const [h, m] = String(time || "").split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  // Returns a map of row index -> problem string, for one day's rows.
  // Rows are compared on their FOOTPRINT, not their nominal length, so the
  // break Focusmate adds after each session is respected.
  function dayProblems(rows) {
    const problems = {};
    const spans = rows.map((r) => {
      const s = toMinutes(r.time);
      return s === null ? null : [s, s + footprint(r.minutes)];
    });
    spans.forEach((span, i) => {
      if (!span) {
        problems[i] = "Needs a time";
        return;
      }
      if (span[0] % 15 !== 0) {
        problems[i] = "Must start on a 15-minute step";
        return;
      }
      if (span[1] > 24 * 60) {
        problems[i] = "Runs past midnight";
        return;
      }
      for (let j = 0; j < spans.length; j++) {
        if (j === i || !spans[j]) continue;
        if (span[0] < spans[j][1] && span[1] > spans[j][0]) {
          // Name the session it clashes with and when that one frees up, so the
          // fix is obvious - the break after a session is what usually bites.
          problems[i] = `Clashes with ${rows[j].time} - that one blocks until ${hhmm(spans[j][1])}`;
          return;
        }
      }
    });
    return problems;
  }

  function scheduleProblems(schedule) {
    const out = {};
    for (const d of DAYS) {
      const p = dayProblems(schedule[d] || []);
      if (Object.keys(p).length) out[d] = p;
    }
    return out;
  }

  function rowCount(schedule) {
    return DAYS.reduce((n, d) => n + (schedule[d] || []).length, 0);
  }

  // ---- expansion --------------------------------------------------------

  // Every session the schedule implies across the picked weeks. Times are built
  // from local components per day, so a DST shift inside the selection keeps
  // every session at its wall-clock time.
  function expandWeeks(schedule, weekKeys) {
    const now = Date.now();
    const out = [];
    const days = [];
    for (const key of weekKeys) {
      const monday = parseKey(key);
      for (let i = 0; i < 7; i++) days.push(addDays(monday, i));
    }
    for (const d of days) {
      for (const row of schedule[dayName(d)] || []) {
        const mins = toMinutes(row.time);
        if (mins === null) continue;
        const t = new Date(
          d.getFullYear(), d.getMonth(), d.getDate(),
          Math.floor(mins / 60), mins % 60, 0, 0
        ).getTime();
        if (t <= now) continue; // never try to book the past
        out.push({
          sessionTime: t,
          duration: row.minutes * 60 * 1000,     // what we send to Focusmate
          span: footprint(row.minutes) * 60 * 1000 // what it actually blocks
        });
      }
    }
    out.sort((a, b) => a.sessionTime - b.sessionTime);
    return out;
  }

  return {
    DAYS, DAY_LABEL, MONTHS, MAX_WEEKS, DURATIONS, HOURS, STEPS, footprint,
    dateKey, parseKey, addDays, startOfToday, mondayOf, dayName,
    weekSpan, fmtDay, fmtWeeks,
    toMinutes, dayProblems, scheduleProblems, rowCount, expandWeeks
  };
})();
