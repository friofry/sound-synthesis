#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function toNumber(value) {
  return Number(String(value).replaceAll(",", ""));
}

function parseBenchFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("· "));

  const parsed = [];
  for (const row of rows) {
    const columns = row
      .slice(2)
      .split(/\s{2,}/)
      .map((col) => col.trim())
      .filter(Boolean);

    if (columns.length < 5) {
      continue;
    }

    const [name, hzRaw, minRaw, maxRaw, meanRaw] = columns;
    const hz = toNumber(hzRaw);
    const minMs = toNumber(minRaw);
    const maxMs = toNumber(maxRaw);
    const meanMs = toNumber(meanRaw);

    if ([hz, minMs, maxMs, meanMs].some((v) => Number.isNaN(v))) {
      continue;
    }

    parsed.push({ name, hz, minMs, maxMs, meanMs, ...parseBenchName(name) });
  }

  return parsed;
}

function parseBenchName(name) {
  const out = {};
  for (const part of name.split(";")) {
    const [key, value] = part.split("=");
    if (!key || value === undefined) {
      continue;
    }
    out[key.trim()] = value.trim();
  }
  return out;
}

function escHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function comboKey(method, precision) {
  const methodShort = method === "runge-kutta" ? "rk" : method;
  return `${methodShort}-${precision}`;
}

function groupByTopology(points) {
  const byTopology = new Map();

  for (const point of points) {
    const topology = point.topology;
    const backend = point.backend;
    const method = point.method;
    const precision = point.precision;
    if (!topology || !backend || !method || !precision) {
      continue;
    }

    if (!byTopology.has(topology)) {
      byTopology.set(topology, new Map());
    }
    const topologyMap = byTopology.get(topology);
    if (!topologyMap.has(backend)) {
      topologyMap.set(backend, {});
    }
    const backendMap = topologyMap.get(backend);
    backendMap[comboKey(method, precision)] = point.hz;
  }

  return byTopology;
}

function buildHtml(title, points) {
  const combos = ["euler-32", "euler-64", "rk-32", "rk-64"];
  const comboColors = {
    "euler-32": "#3b82f6",
    "euler-64": "#06b6d4",
    "rk-32": "#f97316",
    "rk-64": "#ef4444",
  };
  const grouped = groupByTopology(points);
  const topologies = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  const topologyPayload = topologies.map((topology) => {
    const byBackend = grouped.get(topology);
    const backends = [...byBackend.keys()].sort((a, b) => a.localeCompare(b));
    const datasets = combos.map((combo) => ({
      label: combo,
      backgroundColor: comboColors[combo],
      data: backends.map((backend) => byBackend.get(backend)[combo] ?? null),
    }));
    return { topology, backends, datasets };
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 24px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 22px;
    }
    p {
      margin: 0 0 24px;
      opacity: 0.75;
    }
    h2 {
      margin: 28px 0 12px;
      font-size: 18px;
    }
    .chart-wrap {
      margin: 0 0 32px;
      border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      border-radius: 10px;
      padding: 12px;
    }
    canvas {
      width: 100%;
      max-height: 700px;
    }
  </style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p>Generated from vitest bench output. Each topology has backend rows and 4 bars: euler-32, euler-64, rk-32, rk-64.</p>
  <div id="charts"></div>
  <script>
    const groups = ${JSON.stringify(topologyPayload)};
    const chartsRoot = document.getElementById("charts");

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      const title = document.createElement("h2");
      title.textContent = "Topology: " + group.topology;
      chartsRoot.appendChild(title);

      const wrap = document.createElement("div");
      wrap.className = "chart-wrap";
      const canvas = document.createElement("canvas");
      canvas.id = "topology-chart-" + i;
      wrap.appendChild(canvas);
      chartsRoot.appendChild(wrap);

      new Chart(canvas, {
        type: "bar",
        data: {
          labels: group.backends,
          datasets: group.datasets,
        },
        options: {
          indexAxis: "y",
          responsive: true,
          plugins: {
            legend: { display: true },
            title: { display: true, text: "Hz (higher is better)" },
          },
        },
      });
    }
  </script>
</body>
</html>`;
}

function buildFlatHzHtml(title, points) {
  const labels = points.map((point) => point.name);
  const hzData = points.map((point) => point.hz);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 24px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 22px;
    }
    p {
      margin: 0 0 24px;
      opacity: 0.75;
    }
    .chart-wrap {
      margin: 0 0 32px;
      border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      border-radius: 10px;
      padding: 12px;
    }
    canvas {
      width: 100%;
      max-height: 1200px;
    }
  </style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p>Generated from vitest bench output. Hz only (higher is better).</p>
  <div class="chart-wrap">
    <canvas id="flatHzChart"></canvas>
  </div>
  <script>
    const labels = ${JSON.stringify(labels)};
    const hzData = ${JSON.stringify(hzData)};
    new Chart(document.getElementById("flatHzChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "hz", data: hzData, backgroundColor: "#44bebe" }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
      },
    });
  </script>
</body>
</html>`;
}

const inputPath = getArg("input");
const outputPath = getArg("output", "bench-report.html");
const title = getArg("title", "Benchmark performance charts");
const mode = getArg("mode", "topology-hz");

if (!inputPath) {
  console.error("Usage: node scripts/bench-chart.mjs --input <bench-output.txt> [--output bench-report.html] [--title \"...\"] [--mode topology-hz]");
  process.exit(2);
}

if (mode !== "topology-hz") {
  if (mode !== "flat-hz") {
    console.error("Unsupported mode. Available modes: topology-hz, flat-hz");
    process.exit(2);
  }
}

const parsed = parseBenchFile(inputPath);
if (!parsed.length) {
  console.error("No benchmark rows found. Ensure input contains lines starting with '· '.");
  process.exit(2);
}

let html = "";
if (mode === "flat-hz") {
  html = buildFlatHzHtml(title, parsed);
} else {
  const filtered = parsed.filter(
    (point) =>
      typeof point.topology === "string"
      && typeof point.backend === "string"
      && (point.method === "euler" || point.method === "runge-kutta")
      && (point.precision === "32" || point.precision === "64"),
  );

  if (!filtered.length) {
    console.error("No structured benchmark rows matched expected format: topology=...;backend=...;method=...;precision=...");
    process.exit(2);
  }

  html = buildHtml(title, filtered);
}

const fullOutputPath = path.resolve(outputPath);
fs.writeFileSync(fullOutputPath, html);

console.log(`Written: ${fullOutputPath}`);
