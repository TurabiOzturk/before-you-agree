import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAgreement, buildAnalysisRequest, normalizeDocument, scoreFindings } from "../server/analyzer.js";

const document = `Privacy Terms

We may sell personal data to selected partners for valuable consideration.

You may request deletion of your account and retained personal information by contacting support.

Subscriptions do not renew automatically. Refund requests are accepted within fourteen days.`;

test("normalization creates bounded evidence passages", () => {
  const paragraphs = normalizeDocument(document);
  assert.ok(Object.keys(paragraphs).length >= 3);
  assert.ok(Object.values(paragraphs).every((paragraph) => paragraph.length <= 900));
  assert.ok(buildAnalysisRequest(paragraphs).questions.data_sale_evidence);
});

test("analysis only displays a claim after evidence verification", async () => {
  let calls = 0;
  const ask = async (payload) => {
    calls += 1;
    if (payload.state.items) {
      return { answers: Object.fromEntries(Object.keys(payload.questions).map((name) => [name, {
        type: "choice", choice: "supports", confidence: 0.94,
      }])) };
    }
    const answers = {};
    for (const name of Object.keys(payload.questions)) {
      if (name.endsWith("_value")) answers[name] = { type: "choice", choice: "not_addressed", confidence: 0.9 };
    }
    answers.data_sale_value = { type: "choice", choice: "yes", confidence: 0.96 };
    const saleParagraph = Object.entries(payload.state.paragraphs).find(([, text]) => /sell personal data/i.test(text))[0];
    answers.data_sale_evidence = { type: "choice", choice: saleParagraph, confidence: 0.91 };
    return { answers };
  };
  const assessment = await analyzeAgreement({ text: document, url: "https://example.test/privacy" }, ask);
  assert.equal(calls, 2);
  assert.equal(assessment.coverage, "partial");
  assert.equal(assessment.score, undefined);
  assert.equal(assessment.findings.length, 1);
  assert.equal(assessment.findings[0].topic, "data_sale");
  assert.match(assessment.findings[0].evidence[0].exactQuote, /valuable consideration/);
});

test("deterministic score is withheld for partial coverage and clamps complete scores", () => {
  const risks = [
    { topic: "data_sale", value: "yes" },
    { topic: "arbitration", value: "yes" },
    { topic: "cancellation", value: "qualified" },
  ];
  assert.equal(scoreFindings(risks, "partial"), undefined);
  assert.equal(scoreFindings(risks, "complete"), 5);
});
