const defaults = { remoteAnalysis: false, serverUrl: "http://127.0.0.1:8787" };
const form = document.querySelector("#settings");
const enabled = document.querySelector("#remoteAnalysis");
const server = document.querySelector("#serverUrl");
const saved = document.querySelector("#saved");

chrome.storage.local.get(defaults).then((settings) => {
  enabled.checked = settings.remoteAnalysis;
  server.value = settings.serverUrl;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = new URL(server.value);
  if (!['http:', 'https:'].includes(url.protocol)) return;
  await chrome.storage.local.set({ remoteAnalysis: enabled.checked, serverUrl: url.origin });
  saved.textContent = "Saved.";
  setTimeout(() => { saved.textContent = ""; }, 1500);
});
