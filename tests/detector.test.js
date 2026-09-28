import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

async function loadDetector(elements = []) {
  const document = {
    documentElement: { append() {} },
    getElementById() { return { id: "existing-card" }; },
    querySelectorAll() { return elements; },
    addEventListener() {},
    createElement() { return { style: {}, attachShadow: () => ({ append() {} }) }; },
  };
  const context = {
    document,
    chrome: {
      runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: false }) },
      storage: { local: { get: async () => ({ remoteAnalysis: false }) } },
    },
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout, URL, globalThis: {},
  };
  vm.runInNewContext(await readFile(new URL("../src/content.js", import.meta.url), "utf8"), context);
  return context.globalThis.__beforeYouAgree;
}

test("identifies a linked agreement control", async () => {
  const action = { innerText: "Create account", value: "", getClientRects: () => [1] };
  const link = { innerText: "Terms of Service", href: "https://example.test/terms", matches: () => false, getAttribute: () => null };
  const group = {
    innerText: "I agree to the Terms of Service", closest: () => null, matches: () => false,
    querySelectorAll: (selector) => selector.includes("a[href]") ? [link] : [action],
  };
  const control = {
    labels: [{ textContent: "I agree to the Terms of Service" }], form: { querySelectorAll: () => [action] },
    closest: (selector) => selector.includes("footer") ? null : group,
    getAttribute: () => "", getClientRects: () => [1],
  };
  const detector = await loadDetector([control]);
  const [candidate] = detector.findConsentCandidates();
  assert.ok(candidate);
  assert.equal(candidate.documentControls[0], link);
});

test("rejects footer and unrelated preference controls", async () => {
  const footer = { closest: () => null };
  const control = {
    labels: [{ textContent: "Remember me" }], form: null,
    closest: () => footer, getAttribute: () => "", getClientRects: () => [1],
  };
  const detector = await loadDetector([control]);
  assert.equal(detector.findConsentCandidates().length, 0);
});

test("recognizes the supplied Turkish click-controlled agreement", async () => {
  const agreementButton = {
    innerText: "Ön Bilgilendirme Koşulları", matches: (selector) => selector.includes("contract-link"),
    getAttribute: (name) => name === "role" ? "button" : null,
  };
  const group = {
    innerText: "Ön Bilgilendirme Koşulları ve Mesafeli Satış Sözleşmesi'ni okudum, onaylıyorum.",
    closest: () => null, matches: () => true, querySelectorAll: () => [agreementButton],
  };
  const control = {
    labels: [{ textContent: "checkbox label" }], form: null,
    closest: (selector) => {
      if (selector.includes("footer")) return null;
      if (selector.includes('[data-testid*="agreement"]')) return control;
      return selector.includes(".agreement-item") ? group : null;
    },
    getAttribute: () => "", getClientRects: () => [1],
  };
  const detector = await loadDetector([control]);
  const [candidate] = detector.findConsentCandidates();
  assert.ok(candidate);
  assert.match(candidate.label, /Mesafeli Satış Sözleşmesi/);
  assert.equal(candidate.documentControls[0], agreementButton);
});

test("discovers a bounded candidate without requiring a known language", async () => {
  const agreementButton = {
    innerText: "利用規約", getClientRects: () => [1],
    matches: () => false, getAttribute: () => "button",
  };
  const group = {
    innerText: "利用規約を読み、同意します。", parentElement: null,
    closest: () => null, matches: () => false, querySelectorAll: () => [agreementButton],
  };
  const control = {
    labels: [], form: null, parentElement: group, type: "checkbox", tagName: "INPUT",
    closest: () => null, getAttribute: () => "", getClientRects: () => [1],
  };
  const detector = await loadDetector([control]);
  assert.equal(detector.findConsentCandidates().length, 0);
  const [candidate] = detector.findAmbiguousCandidates();
  assert.ok(candidate);
  assert.match(candidate.summary.nearbyText, /利用規約/);
});

test("agreement links are restricted to HTTP and HTTPS", async () => {
  const detector = await loadDetector();
  assert.equal(detector.safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(detector.safeHttpUrl("https://example.test/terms"), "https://example.test/terms");
});
