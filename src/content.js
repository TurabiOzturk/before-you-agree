(() => {
  const legal = /(terms(?:\s+of\s+service)?|privacy\s+policy|user\s+agreement|eula|subscription\s+terms|agreement|contract|consent|ön\s+bilgilendirme|mesafeli\s+satış\s+sözleşmesi|sözleşme|koşullar|şartlar|gizlilik)/i;
  const consentText = /(okudum\s*,?\s*onaylıyorum|kabul\s+ediyorum|i\s+have\s+read\s+and\s+agree|i\s+agree|by\s+(?:creating|continuing|subscribing).{0,60}agree)/i;
  const actions = /(create account|sign up|subscribe|purchase|buy now|continue|register|install|place order|pay now|devam|satın al|siparişi tamamla|öde|üye ol|kayıt ol)/i;
  const controlSelector = 'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[role="switch"]';
  let dismissed = false;
  let currentCandidate;
  let lastOpenedTitle = "";
  let classificationPending = false;
  const classifiedCandidates = new WeakMap();
  let card;

  function isVisible(element) {
    if (!element?.getClientRects) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function textOf(element) {
    return (element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function labelFor(control) {
    const labels = [...(control.labels || [])].map(textOf);
    const labelledBy = (control.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
      .map((id) => textOf(document.getElementById(id)));
    return [...labels, ...labelledBy, textOf(control.closest("label"))].join(" ").replace(/\s+/g, " ").trim();
  }

  function groupFor(control) {
    const semantic = control.closest('.agreement-item,.agreements,.aggrements,fieldset,[role=group],[role=radiogroup]');
    if (semantic) return semantic;
    let group = control.closest("label") || control.parentElement;
    for (let depth = 0; group && depth < 4; depth += 1, group = group.parentElement) {
      const length = textOf(group).length;
      if (length >= 10 && length <= 2_000) return group;
    }
    return control.closest("form") || control.parentElement;
  }

  function candidateFor(control) {
    if (!isVisible(control) || control.closest('footer,[role="contentinfo"],nav,[role="navigation"]')) return null;
    const group = groupFor(control);
    if (!group || group.closest('footer,[role="contentinfo"],nav,[role="navigation"]')) return null;
    const associatedLabel = labelFor(control);
    const groupText = textOf(group);
    const label = legal.test(associatedLabel) || consentText.test(associatedLabel) ? associatedLabel : groupText || associatedLabel;
    if (/(remember me|newsletter|marketing opt|promotional|beni hatırla|kampanya.{0,20}(izin|onay))/i.test(label)) return null;
    const documentControls = [...group.querySelectorAll('a[href],button,[role="button"],[class*="contract-link"]')]
      .filter((item) => legal.test(textOf(item)) || item.matches?.('[class*="contract-link"]'));
    const nearbyAction = [...(control.form?.querySelectorAll('button,[type="submit"]') || group.querySelectorAll('button,[type="submit"]'))]
      .some((button) => isVisible(button) && actions.test(textOf(button) || button.value || ""));
    const structured = group.matches?.('.agreement-item,.agreements,.aggrements');
    const agreement = legal.test(label) && (consentText.test(groupText) || nearbyAction || documentControls.length || structured);
    if (!agreement) return null;
    return { control, group, label: label || groupText, documentControls, confidence: structured || consentText.test(groupText) ? "high" : "medium" };
  }

  function findConsentCandidates(root = document) {
    return [...root.querySelectorAll(controlSelector)].map(candidateFor).filter(Boolean);
  }

  function ambiguousCandidateFor(control) {
    if (!isVisible(control) || control.closest('footer,[role="contentinfo"],nav,[role="navigation"]')) return null;
    const group = groupFor(control);
    if (!group) return null;
    const label = labelFor(control);
    const nearbyText = textOf(group).slice(0, 2_000);
    const interactive = [...group.querySelectorAll('a[href],button,[role="button"]')]
      .filter(isVisible).slice(0, 8);
    const actionTexts = [...(control.form?.querySelectorAll('button,[type="submit"]') || [])]
      .filter(isVisible).map(textOf).filter(Boolean).slice(0, 4);
    if ((label || nearbyText).length < 10 || (!interactive.length && !actionTexts.length)) return null;
    const summary = {
      controlType: control.getAttribute("role") || control.type || control.tagName?.toLowerCase() || "checkable",
      labelText: label.slice(0, 500), nearbyText,
      interactiveTexts: interactive.map(textOf).filter(Boolean), actionTexts,
    };
    const signature = JSON.stringify(summary);
    if (classifiedCandidates.get(control) === signature) return null;
    return {
      control, group, label: label || nearbyText,
      documentControls: interactive.filter((item) => !actions.test(textOf(item))),
      confidence: "classifier", summary, signature,
    };
  }

  function findAmbiguousCandidates(root = document) {
    return [...root.querySelectorAll(controlSelector)].map(ambiguousCandidateFor).filter(Boolean);
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function bestAgreementUrl(candidate) {
    return candidate.documentControls.map((element) => safeHttpUrl(element.href || element.getAttribute?.("href"))).find(Boolean) || "";
  }

  function openAgreementText() {
    const selectors = ['dialog[open]','[role="dialog"]','[aria-modal="true"]','[class*="modal"]','[class*="drawer"]','[class*="popup"]'];
    const explicit = [...document.querySelectorAll(selectors.join(","))]
      .filter(isVisible).map((node) => textOf(node))
      .filter((text) => text.length >= 200 && legal.test(text))
      .sort((a, b) => b.length - a.length)[0];
    if (explicit) return explicit;
    if (!lastOpenedTitle) return "";
    for (const node of document.querySelectorAll("body *")) {
      if (!isVisible(node) || !textOf(node).includes(lastOpenedTitle)) continue;
      for (let overlay = node; overlay && overlay !== document.body; overlay = overlay.parentElement) {
        const style = getComputedStyle(overlay);
        const text = textOf(overlay);
        if (style.position === "fixed" && text.length >= 200 && text.length <= 120_000) return text;
      }
    }
    return "";
  }

  function htmlToText(raw, contentType) {
    if (/text\/plain/i.test(contentType)) return raw.replace(/\s+/g, " ").trim();
    const parsed = new DOMParser().parseFromString(raw, "text/html");
    parsed.querySelectorAll("script,style,noscript,svg,nav,footer,header").forEach((node) => node.remove());
    return textOf(parsed.querySelector("article,main") || parsed.body);
  }

  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function setStatus(message, state = "") {
    if (!card) return;
    card.status.textContent = message;
    card.status.dataset.state = state;
  }

  function renderAssessment(assessment) {
    card.results.replaceChildren();
    const meta = element("p", assessment.coverage === "complete" ? "Complete review" : "Partial review — unaddressed topics are not treated as safe.", "meta");
    if (typeof assessment.score === "number") meta.prepend(element("strong", `${assessment.score}/10 · `));
    if (!assessment.findings?.length) {
      card.results.append(meta, element("p", "No evidence-backed findings passed verification. Read the agreement directly."));
      return;
    }
    const list = document.createElement("ul");
    for (const finding of assessment.findings.slice(0, 5)) {
      list.append(element("li", `${finding.impact === "benefit" ? "✓" : "⚠"} ${finding.plainLanguage}`));
    }
    card.results.append(list);
    if (typeof assessment.confidence === "number") {
      card.results.append(element("p", `Confidence: ${Math.round(assessment.confidence * 100)}%`, "confidence"));
    }
    card.results.append(meta);
    const url = safeHttpUrl(assessment.documentUrl);
    if (url) {
      const source = element("a", "Open source document"); source.href = url; source.target = "_blank"; source.rel = "noopener noreferrer";
      card.results.append(source);
    }
  }

  async function analyze(candidate) {
    setStatus("Reading agreement…", "working");
    let text = openAgreementText();
    let url = "";
    let title = candidate.documentControls.map(textOf).find(Boolean) || "Agreement";
    if (!text) {
      url = bestAgreementUrl(candidate);
      if (!url) throw new Error("Open the agreement on the website, then press Analyze again.");
      const fetched = await chrome.runtime.sendMessage({ type: "fetch-document", url });
      if (!fetched?.ok) throw new Error(fetched?.error || "Could not retrieve the agreement.");
      text = htmlToText(fetched.result.raw, fetched.result.contentType);
      url = fetched.result.url;
    }
    if (text.length < 200) throw new Error("The opened agreement does not contain enough readable text.");
    setStatus("Checking clauses and evidence with JEV…", "working");
    const response = await chrome.runtime.sendMessage({ type: "analyze-agreement", payload: { text: text.slice(0, 120_000), url, title } });
    if (!response?.ok) throw new Error(response?.error || "Analysis failed.");
    renderAssessment(response.result);
    setStatus(`Assessed ${new Date(response.result.assessedAt).toLocaleString()}.`, "done");
  }

  function showCard(candidate) {
    currentCandidate = candidate;
    if (dismissed || card || document.getElementById("before-you-agree-host")) return;
    const host = document.createElement("div");
    host.id = "before-you-agree-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}*{box-sizing:border-box}section{font:14px/1.45 system-ui,sans-serif;width:min(390px,calc(100vw - 32px));padding:16px;background:#101b22;color:#f4f7f5;border:1px solid #416058;border-radius:16px;box-shadow:0 14px 48px #0006}header{display:flex;justify-content:space-between;gap:12px;align-items:center}strong{font-size:15px}p{color:#c5d0cc;margin:10px 0}button{font:inherit;color:inherit;background:#285c49;border:1px solid #5d8d79;border-radius:8px;padding:8px 11px;cursor:pointer}header button{background:transparent;border-color:#49685c}button:focus-visible,a:focus-visible{outline:3px solid #83e0bd;outline-offset:2px}.hint,.meta{font-size:12px;color:#aabbb4}.status[data-state=working]{color:#83e0bd}.status[data-state=error]{color:#ffb7a8}.results{max-height:280px;overflow:auto}.results ul{margin:10px 0;padding-left:20px}.results li{margin:7px 0}.confidence{font-weight:700;color:#f4f7f5}a{color:#83e0bd}`;
    const section = document.createElement("section"); section.setAttribute("role", "region"); section.setAttribute("aria-label", "Before You Agree agreement check");
    const header = document.createElement("header");
    const title = element("strong", "Agreement detected");
    const close = element("button", "Dismiss"); close.type = "button"; close.setAttribute("aria-label", "Dismiss agreement check");
    close.addEventListener("click", () => { dismissed = true; host.remove(); card = null; });
    header.append(title, close);
    const hint = element("p", candidate.label.slice(0, 220), "hint");
    const status = element("p", bestAgreementUrl(candidate) ? "Ready to retrieve and analyze the linked agreement." : "Open the agreement on the website, then analyze the visible document.", "status"); status.setAttribute("aria-live", "polite");
    const analyzeButton = element("button", "Analyze agreement"); analyzeButton.type = "button";
    const results = document.createElement("div"); results.className = "results";
    analyzeButton.addEventListener("click", async () => {
      analyzeButton.disabled = true;
      try { await analyze(currentCandidate); } catch (error) { setStatus(error.message || "Analysis failed.", "error"); }
      finally { analyzeButton.disabled = false; }
    });
    section.append(header, hint, status, analyzeButton, results);
    shadow.append(style, section); document.documentElement.append(host);
    card = { host, status, results };
  }

  async function scan() {
    const candidate = findConsentCandidates()[0];
    if (candidate) return showCard(candidate);
    if (classificationPending) return;
    const ambiguous = findAmbiguousCandidates()[0];
    if (!ambiguous) return;
    const settings = await chrome.storage.local.get({ remoteAnalysis: false });
    if (!settings.remoteAnalysis) return;
    classificationPending = true;
    classifiedCandidates.set(ambiguous.control, ambiguous.signature);
    try {
      const response = await chrome.runtime.sendMessage({ type: "classify-candidate", payload: ambiguous.summary });
      if (response?.ok && response.result.decision === "yes" && response.result.confidence >= 0.9) showCard(ambiguous);
    } catch {
      // Ambiguous candidates fail quietly; deterministic detection remains available.
    } finally {
      classificationPending = false;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    const documentControl = currentCandidate?.documentControls.find((control) => control === target || control.contains?.(target));
    if (documentControl) lastOpenedTitle = textOf(documentControl);
  }, true);

  chrome.runtime.onMessage.addListener((message) => { if (message?.type === "scan-consent") scan(); });
  scan();
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; scan(); }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-checked", "href", "open"] });

  globalThis.__beforeYouAgree = { findConsentCandidates, findAmbiguousCandidates, safeHttpUrl, htmlToText };
})();
