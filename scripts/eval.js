import { readFile } from "node:fs/promises";
import { analyzeAgreement, callSystemOne } from "../server/analyzer.js";

const cases = JSON.parse(await readFile(new URL("../eval/cases.json", import.meta.url), "utf8"));
let failed = 0;

for (const example of cases) {
  const assessment = await analyzeAgreement({ text: example.text, title: example.id }, callSystemOne);
  for (const [topic, expected] of Object.entries(example.expected)) {
    const actual = assessment.classifications[topic]?.value || "missing";
    const pass = actual === expected;
    if (!pass) failed += 1;
    console.log(`${pass ? "PASS" : "FAIL"} ${example.id} ${topic}: expected=${expected} actual=${actual}`);
  }
}

if (failed) process.exitCode = 1;
