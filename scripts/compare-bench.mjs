#!/usr/bin/env node

import fs from "node:fs";

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseBenchFile(path) {
  const text = fs.readFileSync(path, "utf8");
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("· "));

  const result = new Map();
  for (const row of rows) {
    const match = row.match(/^·\s+(.+?)\s+([0-9.]+)\s+[0-9.]+\s+[0-9.]+\s+([0-9.]+)/);
    if (!match) continue;
    const [, name, hzStr, meanStr] = match;
    result.set(name.trim(), {
      hz: Number(hzStr),
      meanMs: Number(meanStr),
    });
  }
  return result;
}

function formatPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

const basePath = getArg("base");
const headPath = getArg("head");
const thresholdPct = Number(getArg("threshold", "15"));

if (!basePath || !headPath) {
  console.error("Usage: node scripts/compare-bench.mjs --base <file> --head <file> [--threshold 15]");
  process.exit(2);
}

const base = parseBenchFile(basePath);
const head = parseBenchFile(headPath);
const names = [...base.keys()].filter((name) => head.has(name));

if (names.length === 0) {
  console.error("No overlapping benchmark rows found between base and head.");
  process.exit(2);
}

let hasRegression = false;
const lines = [];
lines.push("## Benchmark Comparison");
lines.push("");
lines.push(`Threshold: mean time regression > ${thresholdPct}% fails the job.`);
lines.push("");
lines.push("| Benchmark | Base mean (ms) | Head mean (ms) | Delta mean | Base hz | Head hz |");
lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const name of names) {
  const baseMetric = base.get(name);
  const headMetric = head.get(name);
  if (!baseMetric || !headMetric) continue;

  const deltaPct = ((headMetric.meanMs - baseMetric.meanMs) / baseMetric.meanMs) * 100;
  const row = `| ${name} | ${baseMetric.meanMs.toFixed(2)} | ${headMetric.meanMs.toFixed(2)} | ${formatPct(deltaPct)} | ${baseMetric.hz.toFixed(2)} | ${headMetric.hz.toFixed(2)} |`;
  lines.push(row);

  if (deltaPct > thresholdPct) {
    hasRegression = true;
  }
}

if (hasRegression) {
  lines.push("");
  lines.push(`Regression detected: at least one benchmark exceeded +${thresholdPct}% mean time.`);
} else {
  lines.push("");
  lines.push("No benchmark exceeded the allowed regression threshold.");
}

const summary = lines.join("\n");
console.log(summary);

if (hasRegression) {
  process.exit(1);
}
