import { createHash } from "node:crypto";

export const ANALYZER_VERSION = "system-one-evidence-v3";
export const SCORE_VERSION = "risk-weights-v1";

const DISPLAY_CONFIDENCE = { high_risk: 0.75, risk: 0.75, neutral: 0.8, benefit: 0.85 };

const TOPICS = {
  data_sale: {
    question: "Does this agreement say personal data may be sold for money or other valuable consideration?",
    terms: /sell|sale|sold|valuable consideration|kişisel veri.{0,30}(sat|paylaş)/i,
    claims: {
      yes: "The agreement says personal data may be sold.",
      no: "The agreement says personal data is not sold.",
      qualified: "The agreement permits some sale of personal data subject to limits or exceptions.",
    },
    impact: "high_risk", penalty: 2,
  },
  third_party_sharing: {
    question: "Does this agreement permit sharing personal or usage data with third parties?",
    terms: /third part|partner|affiliate|service provider|share.{0,40}data|üçüncü taraf|iş orta|veri.{0,30}paylaş/i,
    claims: {
      yes: "The agreement permits sharing data with third parties.",
      no: "The agreement says personal data is not shared with third parties.",
      qualified: "The agreement permits some third-party data sharing subject to limits.",
    },
    impact: "risk", penalty: 1,
  },
  ads: {
    question: "Does this agreement permit using personal or usage data for targeted advertising or marketing?",
    terms: /advertis|marketing|personalized ad|targeted ad|reklam|pazarlama/i,
    claims: {
      yes: "The agreement permits using data for advertising or marketing.",
      no: "The agreement says data is not used for targeted advertising or marketing.",
      qualified: "The agreement permits some advertising or marketing use subject to limits.",
    },
    impact: "risk", penalty: 1,
  },
  ai_training: {
    question: "Does this agreement permit using user content or personal data to train artificial-intelligence or machine-learning systems?",
    terms: /artificial intelligence|machine learning|train.{0,25}(model|system)|yapay zek|makine öğren/i,
    claims: {
      yes: "The agreement permits using data or content to train AI systems.",
      no: "The agreement says data or content is not used to train AI systems.",
      qualified: "The agreement permits some AI training use subject to limits.",
    },
    impact: "risk", penalty: 1,
  },
  account_deletion: {
    question: "Does this agreement describe a right or process for the user to delete their account or personal data?",
    terms: /delete|deletion|erase|erasure|close.{0,20}account|silme|silin|hesab.{0,20}kapat|unutulma/i,
    claims: {
      yes: "The agreement describes a way to delete an account or personal data.",
      no: "The agreement explicitly denies account or personal-data deletion.",
      qualified: "The agreement describes deletion subject to limits or retention exceptions.",
    },
    impact: "benefit", penalty: 0,
  },
  auto_renewal: {
    question: "Does this agreement provide for an automatically renewing paid subscription?",
    terms: /auto.{0,10}renew|recurring|renewal|subscription|automatically charge|otomatik.{0,15}yenile|abonelik|tekrarlanan ödeme/i,
    claims: {
      yes: "The agreement provides for automatic subscription renewal.",
      no: "The agreement says the subscription does not renew automatically.",
      qualified: "The agreement permits automatic renewal in some circumstances.",
    },
    impact: "risk", penalty: 1,
  },
  cancellation: {
    question: "Does this agreement impose material barriers, narrow deadlines, or extra fees on cancellation?",
    terms: /cancel|cancellation|termination fee|notice period|iptal|cayma|fesih/i,
    claims: {
      yes: "The agreement imposes material conditions or barriers on cancellation.",
      no: "The agreement describes cancellation without material barriers.",
      qualified: "The agreement allows cancellation but applies some conditions or limits.",
    },
    impact: "risk", penalty: 1.5,
  },
  refunds: {
    question: "Does this agreement describe a right or process for the user to obtain a refund?",
    terms: /refund|money back|reimburse|iade|geri ödeme|bedel.{0,20}iade/i,
    claims: {
      yes: "The agreement describes a refund right or process.",
      no: "The agreement says payments are not refundable.",
      qualified: "The agreement permits refunds only in limited circumstances.",
    },
    impact: "benefit", penalty: 0,
  },
  arbitration: {
    question: "Does this agreement impose private binding arbitration that replaces or materially restricts access to a court?",
    terms: /arbitrat|dispute resolution|hakem|tahkim|uyuşmazlık|arabulucu|mahkeme/i,
    criteria: {
      yes: "The contract requires private binding arbitration or an arbitral forum instead of court access.",
      no: "The contract routes disputes to courts or a statutory consumer dispute body and does not impose private binding arbitration. A Turkish Tüketici Hakem Heyeti is a statutory consumer body, and arabuluculuk is mediation; neither is private contractual arbitration.",
      qualified: "Private arbitration applies only to some disputes, is optional, has an opt-out, or coexists ambiguously with court access.",
      not_addressed: "The contract does not address private binding arbitration or dispute forums.",
      unclear: "The forum language is contradictory or cannot be distinguished from mediation or a statutory tribunal.",
    },
    claims: {
      yes: "The agreement requires or strongly directs disputes to private binding arbitration.",
      no: "The agreement directs disputes to statutory consumer bodies or courts rather than imposing private mandatory arbitration.",
      qualified: "The agreement applies private arbitration only in limited or optional circumstances.",
    },
    impact: "high_risk", penalty: 1.5,
  },
  class_action_waiver: {
    question: "Does this agreement waive or restrict the user's ability to participate in a class or collective action?",
    terms: /class action|collective action|representative action|toplu dava|grup davası/i,
    claims: {
      yes: "The agreement restricts class or collective actions.",
      no: "The agreement explicitly preserves class or collective actions.",
      qualified: "The agreement restricts class or collective actions in some circumstances.",
    },
    impact: "high_risk", penalty: 1,
  },
  content_license: {
    question: "Does this agreement give the service a broad, long-lasting license to content uploaded by the user?",
    terms: /license|licence|perpetual|irrevocable|royalty.free|user content|içerik.{0,30}lisans|süresiz|gayrikabili rücu/i,
    claims: {
      yes: "The agreement grants the service a broad license to user content.",
      no: "The agreement says users retain content rights without granting a broad service license.",
      qualified: "The agreement grants a user-content license limited by purpose, duration, or scope.",
    },
    impact: "risk", penalty: 1,
  },
  unilateral_changes: {
    question: "Does this agreement allow the service to make material unilateral changes with weak or no advance notice?",
    terms: /modify|change.{0,25}terms|without notice|sole discretion|değiştir|önceden bildirim|tek taraflı/i,
    claims: {
      yes: "The agreement allows unilateral changes with weak or no advance notice.",
      no: "The agreement requires meaningful advance notice or consent for material changes.",
      qualified: "The agreement allows unilateral changes but describes some notice or limits.",
    },
    impact: "risk", penalty: 0.5,
  },
  account_termination: {
    question: "Does this agreement allow the service to suspend or terminate an account broadly or without a stated cause?",
    terms: /suspend|terminate|disable.{0,20}account|sole discretion|askıya al|hesab.{0,25}(kapat|feshet)|üyeli.{0,20}sonlandır/i,
    claims: {
      yes: "The agreement gives the service broad account suspension or termination power.",
      no: "The agreement limits account suspension or termination to stated causes.",
      qualified: "The agreement permits account suspension or termination subject to some limits.",
    },
    impact: "risk", penalty: 0.5,
  },
};

const CLASSIFICATION_CRITERIA = {
  yes: "The document explicitly says the condition in the question applies.",
  no: "The document explicitly says the condition does not apply. This requires an express denial, not silence.",
  qualified: "The condition applies only in some circumstances, or the document states material limits or exceptions.",
  not_addressed: "The document does not address the condition. Missing language belongs here, not under no.",
  unclear: "The language is contradictory or too ambiguous to classify reliably.",
};

export function redactPersonalData(input) {
  let text = String(input || "");
  text = text
    .replace(/((?:ALICI|BUYER|CUSTOMER)\s+BİLGİLERİ\s*)[\s\S]*?(?=\n\s*(?:SATICI|SELLER|MERCHANT)\s+BİLGİLERİ)/gi, "$1\n[REDACTED_PERSONAL_DETAILS]\n")
    .replace(/((?:FATURA|BILLING)\s+BİLGİLERİ\s*)[\s\S]*?(?=\n\s*\d+(?:\.\d+)*\.\s*[A-ZÇĞİÖŞÜ])/gi, "$1\n[REDACTED_PERSONAL_DETAILS]\n")
    .replace(/(^|\n)(\s*(?:Teslim Edilecek Kişi|Teslimat Adresi|Fatura Adresi|E-posta(?:\/Kullanıcı Adı)?|Kullanıcı Adı|Telefon|Faks|Recipient|Delivery Address|Billing Address|E-?mail|Phone)\s*:\s*)[^\n]*/gim, "$1$2[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)(?:\+?\d[ \t().-]*){10,15}(?!\d)/g, "[REDACTED_PHONE]");
  return text;
}

export function normalizeDocument(input) {
  const clean = redactPersonalData(input).replace(/\0/g, "").replace(/\r/g, "\n").trim();
  if (clean.length < 200) throw new Error("Agreement text is too short to assess.");
  const blocks = clean.split(/\n{2,}/).flatMap((block) => {
    const compact = block.replace(/\s+/g, " ").trim();
    if (compact.length <= 900) return [compact];
    return compact.match(/.{1,900}(?:[.!?](?=\s|$)|$)/g) || [compact.slice(0, 900)];
  }).filter((block) => block.length >= 20);
  const paragraphs = {};
  const seen = new Set();
  let total = 0;
  for (const block of blocks) {
    if (seen.has(block)) continue;
    if (total + block.length > 40_000 || Object.keys(paragraphs).length >= 100) break;
    seen.add(block);
    const id = `p${Object.keys(paragraphs).length + 1}`;
    paragraphs[id] = block;
    total += block.length;
  }
  if (total < 200) throw new Error("Agreement text is too short to assess.");
  return paragraphs;
}

function evidenceCandidates(paragraphs, topic) {
  const all = Object.entries(paragraphs)
    .map(([id, text]) => ({ id, text, score: (text.match(new RegExp(topic.terms.source, topic.terms.flags + "g")) || []).length }));
  const lexical = all.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  // ponytail: unknown-language fallback fans out across bounded paragraphs; add semantic retrieval if token cost becomes material.
  return lexical.length ? lexical : all;
}

export function scoreFindings(findings, coverage) {
  if (coverage !== "complete") return undefined;
  const penalty = findings.reduce((sum, finding) => {
    const topic = TOPICS[finding.topic];
    return sum + (["yes", "qualified"].includes(finding.value) && topic.impact !== "benefit" ? topic.penalty : 0);
  }, 0);
  return Math.max(0, Math.min(10, Math.round((10 - penalty) * 10) / 10));
}

export function buildAnalysisRequest(paragraphs) {
  const questions = {};
  for (const [name, topic] of Object.entries(TOPICS)) {
    questions[`${name}_value`] = {
      type: "choice",
      instructions: { question: topic.question, rule: "Read all `paragraphs`. Do not treat silence as no." },
      criteria: topic.criteria || CLASSIFICATION_CRITERIA,
    };
    const candidates = evidenceCandidates(paragraphs, topic);
    if (candidates.length) {
      questions[`${name}_evidence`] = {
        type: "choice",
        instructions: { question: `Which candidate passage most directly answers: ${topic.question}`, rule: "Choose none if no candidate directly answers it." },
        criteria: Object.fromEntries([
          ...candidates.map(({ id }) => [id, `The exact passage at \`paragraphs.${id}\`.`]),
          ["none", "None of the candidate passages directly answers the question."],
        ]),
      };
    }
  }
  return { state: { paragraphs }, model: process.env.SYSTEM_ONE_MODEL || "jev-latest", questions };
}

function parseChoice(answer, allowed) {
  if (!answer || answer.type !== "choice" || !allowed.includes(answer.choice) || typeof answer.confidence !== "number") return null;
  return answer;
}

export async function analyzeAgreement({ text, url = "", title = "Agreement" }, ask) {
  const paragraphs = normalizeDocument(text);
  const normalized = Object.values(paragraphs).join("\n\n");
  const documentHash = createHash("sha256").update(normalized).digest("hex");
  const first = await ask(buildAnalysisRequest(paragraphs));
  const proposed = [];
  const classifications = {};

  for (const [name, topic] of Object.entries(TOPICS)) {
    const valueAnswer = parseChoice(first.answers?.[`${name}_value`], Object.keys(CLASSIFICATION_CRITERIA));
    if (!valueAnswer) continue;
    classifications[name] = { value: valueAnswer.choice, confidence: valueAnswer.confidence };
    if (!["yes", "no", "qualified"].includes(valueAnswer.choice) || valueAnswer.confidence < 0.6) continue;
    const evidenceAnswer = parseChoice(first.answers?.[`${name}_evidence`], [...Object.keys(paragraphs), "none"]);
    const quote = evidenceAnswer?.choice === "none" ? "" : paragraphs[evidenceAnswer?.choice];
    const claim = topic.claims[valueAnswer.choice];
    if (!quote || !claim || evidenceAnswer.confidence < 0.5) continue;
    const impact = topic.impact === "benefit"
      ? ({ yes: "benefit", qualified: "neutral", no: "risk" }[valueAnswer.choice])
      : ({ yes: topic.impact, qualified: "risk", no: "benefit" }[valueAnswer.choice]);
    proposed.push({ topic: name, value: valueAnswer.choice, impact, confidence: Math.min(valueAnswer.confidence, evidenceAnswer.confidence), plainLanguage: claim, exactQuote: quote });
  }

  const verified = [];
  if (proposed.length) {
    const items = Object.fromEntries(proposed.map((finding) => [finding.topic, { claim: finding.plainLanguage, excerpt: finding.exactQuote }]));
    const questions = Object.fromEntries(proposed.map((finding) => [finding.topic, {
      type: "choice",
      instructions: `Does \`items.${finding.topic}.excerpt\` support \`items.${finding.topic}.claim\`?`,
      criteria: {
        supports: "The excerpt states the claim or directly implies it.",
        contradicts: "The excerpt states or directly implies the opposite.",
        says_nothing: "The excerpt does not establish the claim.",
      },
    }]));
    const check = await ask({ state: { items }, model: process.env.SYSTEM_ONE_MODEL || "jev-latest", questions });
    for (const finding of proposed) {
      const answer = parseChoice(check.answers?.[finding.topic], ["supports", "contradicts", "says_nothing"]);
      const confidence = Math.min(finding.confidence, answer?.confidence ?? 0);
      if (answer?.choice === "supports" && confidence >= DISPLAY_CONFIDENCE[finding.impact]) {
        verified.push({
          ...finding, confidence,
          evidence: [{ documentHash, documentUrl: url, exactQuote: finding.exactQuote }],
        });
      }
    }
  }

  const core = ["data_sale", "third_party_sharing", "account_deletion", "auto_renewal", "cancellation", "arbitration", "content_license", "unilateral_changes"];
  const coverage = core.every((name) => classifications[name]?.confidence >= 0.7 && ["yes", "no", "qualified"].includes(classifications[name].value)) ? "complete" : "partial";
  const priority = { high_risk: 4, risk: 3, benefit: 2, neutral: 1 };
  const findings = verified.sort((a, b) => priority[b.impact] - priority[a.impact]).slice(0, 8);
  const confidence = findings.length ? Math.min(...findings.map((finding) => finding.confidence)) : undefined;
  return {
    agreementHashes: [documentHash], source: "model_extracted", title, documentUrl: url,
    findings, confidence, coverage, score: scoreFindings(findings, coverage), scoreVersion: SCORE_VERSION,
    extractorVersion: ANALYZER_VERSION, assessedAt: new Date().toISOString(), classifications,
  };
}

export async function classifyConsentCandidate(summary, ask) {
  const candidate = Object.fromEntries(Object.entries(summary).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(redactPersonalData) : typeof value === "string" ? redactPersonalData(value) : value,
  ]));
  const result = await ask({
    state: { candidate },
    model: process.env.SYSTEM_ONE_MODEL || "jev-latest",
    questions: {
      consent_event: {
        type: "choice",
        instructions: {
          question: "Does `candidate` show a user being asked to accept or acknowledge a legal or commercial agreement as part of a nearby consequential action?",
          language_rule: "Interpret the candidate in its own language. Do not require English wording.",
        },
        criteria: {
          yes: "A control or acceptance statement is tied to terms, a contract, a policy, or another legal/commercial agreement.",
          no: "This is navigation, remember-me, newsletter, marketing preference, or another control unrelated to accepting an agreement.",
          unsure: "The bounded candidate does not contain enough relationship evidence.",
        },
      },
    },
  });
  const answer = parseChoice(result.answers?.consent_event, ["yes", "no", "unsure"]);
  if (!answer) throw new Error("The classifier returned an invalid consent decision.");
  return { decision: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities || {} };
}

export async function callSystemOne(payload) {
  const apiKey = process.env.SYSTEM_ONE_API_KEY || process.env.JEV_API_KEY;
  const endpoint = process.env.SYSTEM_ONE_ENDPOINT || "https://api.typesafe.ai/v1/systemone";
  const model = process.env.SYSTEM_ONE_MODEL || "jev-latest";
  if (!apiKey) throw new Error("Set JEV_API_KEY or SYSTEM_ONE_API_KEY on the analysis server.");
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...payload, model }),
      signal: AbortSignal.timeout(60_000),
    });
    if (![429, 529].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  if (!response?.ok) throw new Error(`System One request failed (${response?.status || "network"}).`);
  const result = await response.json();
  if (!result?.answers || typeof result.answers !== "object") throw new Error("The System One endpoint returned an invalid response.");
  return result;
}
