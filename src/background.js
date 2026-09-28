const DEFAULT_SERVER = "http://127.0.0.1:8787";

function safePublicUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const privateIp = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
    || /^\[(?:::1|f[cd]|fe[89ab])/.test(host);
  if (!['http:', 'https:'].includes(url.protocol) || host === "localhost" || host.endsWith(".local") || privateIp) throw new Error("Only public HTTP(S) agreement URLs can be retrieved.");
  return url.href;
}

async function fetchDocument(url) {
  const requested = safePublicUrl(url);
  const response = await fetch(requested, { credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
  safePublicUrl(response.url);
  if (!response.ok) throw new Error(`Agreement retrieval failed (${response.status}).`);
  const type = response.headers.get("content-type") || "";
  if (!/text\/(html|plain)|application\/xhtml\+xml/i.test(type)) throw new Error("This agreement format is not readable yet.");
  const raw = await response.text();
  if (raw.length > 1_000_000) throw new Error("This agreement is too large to read safely.");
  return { raw, contentType: type, url: response.url };
}

async function systemOne(path, payload) {
  const settings = await chrome.storage.local.get({ remoteAnalysis: false, serverUrl: DEFAULT_SERVER });
  if (!settings.remoteAnalysis) throw new Error("Enable private analysis in the extension settings first.");
  const server = new URL(settings.serverUrl);
  if (!['http:', 'https:'].includes(server.protocol)) throw new Error("The analysis server URL is invalid.");
  let response;
  try {
    response = await fetch(new URL(path, server), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error(`Cannot reach the analysis server at ${server.origin}. Start it with npm run server.`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Analysis failed (${response.status}).`);
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const task = message?.type === "fetch-document" ? fetchDocument(message.url)
    : message?.type === "analyze-agreement" ? systemOne("/analyze", message.payload)
      : message?.type === "classify-candidate" ? systemOne("/classify-candidate", message.payload)
        : null;
  if (!task) return false;
  task.then((result) => reply({ ok: true, result }), (error) => reply({ ok: false, error: error.message || "Request failed." }));
  return true;
});
