/**
 * Penetration Test Runner — executes all four pen test suites sequentially
 * and prints a combined pass/fail summary.
 *
 * Usage:
 *   node pen-tests/run-all.mjs
 *   node pen-tests/run-all.mjs --json    # write results/pentest-<ts>.json
 */

import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(__dirname, "results");
const JSON_OUT = process.argv.includes("--json");

const SUITES = [
  { name: "Authentication & Sessions",           file: "auth.pentest.mjs" },
  { name: "Authorization & Broken Access",       file: "authz.pentest.mjs" },
  { name: "Injection & Input Validation",        file: "injection.pentest.mjs" },
  { name: "Sensitive Data & Security Headers",   file: "headers.pentest.mjs" },
];

const suiteResults = [];
let overallPassed = true;

for (const suite of SUITES) {
  console.log(`\n${"─".repeat(58)}`);
  console.log(`  Running: ${suite.name}`);
  console.log(`${"─".repeat(58)}`);

  const result = spawnSync(
    "node",
    [join(__dirname, suite.file)],
    { cwd: ROOT, stdio: "inherit", timeout: 120_000 }
  );

  const passed = result.status === 0;
  if (!passed) overallPassed = false;

  suiteResults.push({
    suite: suite.name,
    file: suite.file,
    exitCode: result.status,
    status: passed ? "PASS" : "FAIL",
  });
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log("\n");
console.log("╔══════════════════════════════════════════════════════╗");
console.log("║              PENETRATION TEST SUMMARY               ║");
console.log("╠══════════════════════════════════════════════════════╣");
for (const r of suiteResults) {
  const icon = r.status === "PASS" ? "+" : "!";
  const label = r.name?.padEnd(40) ?? r.suite.padEnd(40);
  console.log(`║  [${icon}] ${r.suite.slice(0, 44).padEnd(44)} ║`);
}
console.log("╠══════════════════════════════════════════════════════╣");
const totalPass = suiteResults.filter(r => r.status === "PASS").length;
const totalFail = suiteResults.filter(r => r.status === "FAIL").length;
console.log(`║  Suites passed: ${String(totalPass).padEnd(2)} / ${suiteResults.length}                               ║`);
if (totalFail > 0) {
  console.log(`║  FAIL: ${String(totalFail).padEnd(2)} suite(s) have security findings              ║`);
}
console.log("╚══════════════════════════════════════════════════════╝");

if (JSON_OUT) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, `pentest-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    overallStatus: overallPassed ? "PASS" : "FAIL",
    passed: totalPass,
    total: suiteResults.length,
    suites: suiteResults,
  }, null, 2));
  console.log(`\n  Results written to ${outPath}`);
}

process.exit(overallPassed ? 0 : 1);
