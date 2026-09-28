import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

test("unreachable coordinator returns an actionable error", async () => {
  let listener;
  const context = {
    chrome: {
      storage: { local: { get: async () => ({ remoteAnalysis: true, serverUrl: "http://127.0.0.1:8787" }) } },
      runtime: { onMessage: { addListener(value) { listener = value; } } },
    },
    fetch: async () => { throw new TypeError("Failed to fetch"); },
    AbortSignal, URL,
  };
  vm.runInNewContext(await readFile(new URL("../src/background.js", import.meta.url), "utf8"), context);
  const response = await new Promise((resolve) => {
    assert.equal(listener({ type: "analyze-agreement", payload: {} }, {}, resolve), true);
  });
  assert.equal(response.ok, false);
  assert.match(response.error, /Start it with npm run server/);
});
