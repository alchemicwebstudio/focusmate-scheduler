// Persisted config: the weekly schedule and the last picked week range.
// chrome.storage.local, one key. Local to this browser profile - not synced,
// not sent to Focusmate.

window.FM = window.FM || {};

window.FM.store = (() => {
  const KEY = "fmConfig";

  function empty() {
    const schedule = {};
    for (const d of window.FM.weeks.DAYS) schedule[d] = [];
    return { schedule, lastWeeks: [] };
  }

  async function load() {
    const got = await chrome.storage.local.get(KEY);
    const cfg = got && got[KEY];
    if (!cfg || !cfg.schedule) return empty();
    // Tolerate a config written by an older/partial version.
    const base = empty();
    for (const d of window.FM.weeks.DAYS) {
      if (Array.isArray(cfg.schedule[d])) base.schedule[d] = cfg.schedule[d];
    }
    base.lastWeeks = Array.isArray(cfg.lastWeeks)
      ? cfg.lastWeeks.filter((k) => typeof k === "string")
      : [];
    return base;
  }

  async function save(cfg) {
    await chrome.storage.local.set({ [KEY]: cfg });
  }

  return { load, save };
})();
