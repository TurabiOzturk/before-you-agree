import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAgreement, buildAnalysisRequest, classifyConsentCandidate, normalizeDocument, redactPersonalData, scoreFindings } from "../server/analyzer.js";

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
  assert.equal(assessment.confidence, 0.91);
  assert.equal(assessment.findings[0].topic, "data_sale");
  assert.match(assessment.findings[0].evidence[0].exactQuote, /valuable consideration/);
});

test("personalized agreement fields are redacted before analysis", async () => {
  const personalized = `ALICI BİLGİLERİ\nTeslim Edilecek Kişi: Example Person\nTeslimat Adresi: Example Street 5\nTelefon: 0555 111 22 33\nE-posta/Kullanıcı Adı: person@example.test\nSATICI BİLGİLERİ\nSatıcı: Example Shop`;
  const redacted = redactPersonalData(personalized);
  assert.doesNotMatch(redacted, /Example Person|Example Street|person@example|0555/);
  assert.match(redacted, /REDACTED_PERSONAL_DETAILS/);

  await classifyConsentCandidate({ nearbyText: "I agree — person@example.test", interactiveTexts: ["Terms"] }, async (request) => {
    assert.doesNotMatch(request.state.candidate.nearbyText, /person@example/);
    return { answers: { consent_event: { type: "choice", choice: "yes", confidence: 0.99 } } };
  });
});

test("normalization removes duplicate paragraphs", () => {
  const repeated = "This agreement provides a fourteen-day refund process and access to consumer courts. ".repeat(3);
  const paragraphs = normalizeDocument(`${repeated}\n\n${repeated}\n\n${repeated}`);
  assert.equal(Object.keys(paragraphs).length, 1);
});

test("unknown-language documents still receive evidence-selection questions", () => {
  const paragraphs = normalizeDocument("利用規約。個人情報を第三者に販売する場合があります。アカウントは設定画面から削除できます。".repeat(8));
  const request = buildAnalysisRequest(paragraphs);
  assert.ok(request.questions.data_sale_evidence);
  assert.ok(Object.keys(request.questions.data_sale_evidence.criteria).some((choice) => choice.startsWith("p")));
});

test("classifier fallback interprets a bounded candidate in its own language", async () => {
  const result = await classifyConsentCandidate({ nearbyText: "利用規約を読み、同意します。", interactiveTexts: ["利用規約"] }, async (request) => {
    assert.match(request.questions.consent_event.instructions.language_rule, /own language/);
    return { answers: { consent_event: { type: "choice", choice: "yes", confidence: 0.97, probabilities: { yes: 0.98, no: 0.01, unsure: 0.01 } } } };
  });
  assert.deepEqual(result, { decision: "yes", confidence: 0.97, probabilities: { yes: 0.98, no: 0.01, unsure: 0.01 } });
});

test("Turkish statutory consumer forums are distinguished from private arbitration", async () => {
  const clause = "Uyuşmazlıklarda Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir. Tüketici Mahkemesinde dava açılmadan önce arabulucuya başvurulur. ".repeat(3);
  const paragraphs = normalizeDocument(clause);
  const request = buildAnalysisRequest(paragraphs);
  assert.match(request.questions.arbitration_value.criteria.no, /statutory consumer body/);
  assert.match(request.questions.arbitration_value.criteria.no, /mediation/);

  async function assess(confidence) {
    return analyzeAgreement({ text: clause }, async (payload) => {
      if (payload.state.items) return { answers: { arbitration: { type: "choice", choice: "supports", confidence: 0.99 } } };
      const answers = Object.fromEntries(Object.keys(payload.questions)
        .filter((name) => name.endsWith("_value"))
        .map((name) => [name, { type: "choice", choice: "not_addressed", confidence: 0.95 }]));
      answers.arbitration_value = { type: "choice", choice: "no", confidence };
      answers.arbitration_evidence = { type: "choice", choice: "p1", confidence: 0.99 };
      return { answers };
    });
  }

  assert.equal((await assess(0.84)).findings.length, 0);
  const assessment = await assess(0.9);
  assert.equal(assessment.findings[0].value, "no");
  assert.match(assessment.findings[0].plainLanguage, /statutory consumer bodies or courts/);
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
