document.querySelector("#scan").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "scan-consent" }).catch(() => {});
  window.close();
});

document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
