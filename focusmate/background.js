// Toolbar click -> open the scheduler overlay in a Focusmate tab.
const FM_URL = "https://app.focusmate.com/";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.startsWith(FM_URL)) {
    // Not on Focusmate: open it. The content script mounts nothing until asked,
    // so tell it to open once the page is ready.
    const created = await chrome.tabs.create({ url: FM_URL });
    whenReady(created.id, () => openIn(created.id));
    return;
  }
  openIn(tab.id);
});

// Run fn once tabId has finished loading, but only if it is still on Focusmate
// - the user can navigate away while a page is loading, and nothing here should
// act on whatever ended up in the tab instead.
function whenReady(tabId, fn) {
  const onUpdated = (id, info, tab) => {
    if (id !== tabId || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (tab && tab.url && tab.url.startsWith(FM_URL)) fn();
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
}

// Ask the content script to open. If it is not there - the extension was
// installed or updated after this tab loaded - reload the tab so the manifest's
// content_scripts run, and ask again. Reloading keeps this to the `tabs` API
// alone: no `scripting` permission, so the extension never holds the right to
// inject arbitrary code.
async function openIn(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "FM_OPEN" });
  } catch (e) {
    // Listener first, so a fast reload cannot land before we are watching.
    // One reload only - if the retry still finds nobody, stop rather than loop.
    whenReady(tabId, () => {
      chrome.tabs.sendMessage(tabId, { type: "FM_OPEN" }).catch(() => {});
    });
    chrome.tabs.reload(tabId);
  }
}
