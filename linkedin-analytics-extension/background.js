// Background service worker. Stores fetched LinkedIn data in chrome.storage.local.
// No external network calls — everything stays on the user's machine.
"use strict";

const STORAGE_KEY = "li_analytics_snapshot";

async function getLinkedInTab() {
  const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
  return tabs[0] || null;
}

async function ensureLinkedInTab() {
  let tab = await getLinkedInTab();
  if (tab) return tab;
  tab = await chrome.tabs.create({
    url: "https://www.linkedin.com/feed/",
    active: false,
  });
  // Wait for content script to be ready.
  await new Promise((r) => setTimeout(r, 4000));
  return tab;
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "fetchAll") {
        const tab = await ensureLinkedInTab();
        if (!tab?.id)
          return sendResponse({ success: false, error: "No LinkedIn tab" });
        const resp = await sendToTab(tab.id, {
          type: "getAll",
          postCount: msg.postCount || 50,
        });
        if (resp?.success) {
          await chrome.storage.local.set({ [STORAGE_KEY]: resp.data });
        }
        sendResponse(resp);
        return;
      }
      if (msg.type === "getSnapshot") {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        sendResponse({ success: true, data: data[STORAGE_KEY] || null });
        return;
      }
      if (msg.type === "clear") {
        await chrome.storage.local.remove(STORAGE_KEY);
        sendResponse({ success: true });
        return;
      }
      sendResponse({ success: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ success: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});
