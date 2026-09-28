import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeAgreement, ANALYZER_VERSION, callJev, SCORE_VERSION } from "./analyzer.js";

const port = Number(process.env.PORT || 8787);
const cacheDir = join(process.cwd(), ".cache", "assessments");

function allowedOrigin(origin) {
  return !origin || origin.startsWith("chrome-extension://");
}

function send(response, status, body, origin = "") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin && allowedOrigin(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 150_000) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function attachSource(assessment, input) {
  return {
    ...assessment,
    title: input.title,
    documentUrl: input.url,
    findings: assessment.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((evidence) => ({ ...evidence, documentUrl: input.url })),
    })),
  };
}

async function cachedAnalyze(input) {
  const key = await import("node:crypto").then(({ createHash }) => createHash("sha256")
    .update(`${ANALYZER_VERSION}:${SCORE_VERSION}:${input.text}`).digest("hex"));
  const file = join(cacheDir, `${key}.json`);
  try { return attachSource(JSON.parse(await readFile(file, "utf8")), input); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const assessment = await analyzeAgreement({ text: input.text }, callJev);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, JSON.stringify(assessment), { mode: 0o600 });
  return attachSource(assessment, input);
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (!allowedOrigin(origin)) return send(response, 403, { error: "Origin not allowed." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "Origin",
    });
    return response.end();
  }
  if (request.method === "GET" && request.url === "/health") return send(response, 200, { ok: true, analyzerVersion: ANALYZER_VERSION }, origin);
  if (request.method !== "POST" || request.url !== "/analyze") return send(response, 404, { error: "Not found." }, origin);
  try {
    const input = await body(request);
    if (typeof input?.text !== "string" || input.text.length > 120_000) throw new Error("Agreement text must be 200–120000 characters.");
    const assessment = await cachedAnalyze({ text: input.text, url: String(input.url || "").slice(0, 2048), title: String(input.title || "Agreement").slice(0, 200) });
    send(response, 200, assessment, origin);
  } catch (error) {
    const clientError = /short|large|characters|JSON/.test(error.message);
    send(response, clientError ? 400 : 502, { error: error.message || "Analysis failed." }, origin);
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Consent Intelligence analysis server listening on http://127.0.0.1:${port}`));
