import { CharMapping } from "./normalize";

export type RangeDiffData = {
  rangeLabel: string;
  charMappings: CharMapping[];
  original: string;
  normalized: string;
};

export type ReportData = {
  ranges: RangeDiffData[];
  documentUri: string;
  runId: string;
  timestamp: string;
  editsApplied: boolean;
};

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cpStr(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Returns a visible representation for control / whitespace characters. */
function visChar(ch: string): string {
  if (ch === "\n") { return "↵"; }
  if (ch === "\r") { return "↵"; }
  if (ch === "\t") { return "→"; }
  const cp = ch.codePointAt(0) ?? 0;
  // C0/C1 control chars other than tab/newline/cr
  if ((cp <= 0x1f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f)) {
    return `[${cpStr(cp)}]`;
  }
  return ch;
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

type HistEntry = {
  char: string;
  codePoint: number;
  count: number;
  mapped: boolean;
  unmapped: boolean;
  illegalOutput: boolean;
  replacement: string;
};

function buildHistogram(all: CharMapping[]): HistEntry[] {
  const map = new Map<string, HistEntry>();
  for (const m of all) {
    const e = map.get(m.original);
    if (e) {
      e.count++;
    } else {
      map.set(m.original, {
        char: m.original,
        codePoint: m.originalCodePoint,
        count: 1,
        mapped: m.mapped,
        unmapped: m.unmapped,
        illegalOutput: m.illegalOutput,
        replacement: m.replacement,
      });
    }
  }
  const rank = (e: HistEntry) =>
    e.unmapped ? 0 : e.illegalOutput ? 1 : e.mapped ? 2 : 3;
  return Array.from(map.values()).sort((a, b) => {
    const rd = rank(a) - rank(b);
    return rd !== 0 ? rd : a.codePoint - b.codePoint;
  });
}

function renderHistogram(all: CharMapping[]): string {
  const entries = buildHistogram(all);

  const totalChars = all.length;
  const changedCount = all.filter((m) => m.mapped).length;
  const unmappedCount = all.filter((m) => m.unmapped).length;
  const illegalCount = all.filter((m) => m.illegalOutput).length;

  const rows = entries
    .map((e) => {
      const display = esc(visChar(e.char));
      const cp = cpStr(e.codePoint);
      let rowClass = "hist-normal";
      let statusClass = "";
      let statusLabel = "normal";

      if (e.unmapped) {
        rowClass = "hist-notable";
        statusClass = "c-unmapped";
        statusLabel = "unmapped — review";
      } else if (e.illegalOutput) {
        rowClass = "hist-notable";
        statusClass = "c-illegal";
        statusLabel = "illegal output";
      } else if (e.mapped) {
        rowClass = "hist-notable";
        statusClass = "c-changed";
        statusLabel = "mapped";
      }

      let replacementCell: string;
      if (e.mapped) {
        replacementCell =
          e.replacement === ""
            ? "<em>(deleted)</em>"
            : `<code class="repl">${esc(e.replacement)}</code>`;
      } else {
        replacementCell = "<em class=\"muted\">(unchanged)</em>";
      }

      return `<tr class="${rowClass}">
        <td class="hist-char ${statusClass}" title="${esc(cp)}">${display}</td>
        <td class="hist-cp mono">${esc(cp)}</td>
        <td class="hist-count mono">${e.count.toLocaleString()}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>${replacementCell}</td>
      </tr>`;
    })
    .join("\n");

  return `
  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-num">${totalChars.toLocaleString()}</div>
      <div class="stat-lbl">Total Characters</div>
    </div>
    <div class="stat-box stat-changed">
      <div class="stat-num">${changedCount.toLocaleString()}</div>
      <div class="stat-lbl">Mapped (Changed)</div>
    </div>
    <div class="stat-box stat-unmapped">
      <div class="stat-num">${unmappedCount.toLocaleString()}</div>
      <div class="stat-lbl">Unmapped (Review)</div>
    </div>
    <div class="stat-box stat-illegal">
      <div class="stat-num">${illegalCount.toLocaleString()}</div>
      <div class="stat-lbl">Illegal Output</div>
    </div>
  </div>

  <h2>Character Histogram</h2>
  <div class="hist-controls">
    <button id="toggle-normal" class="btn-sm">Show all rows</button>
    <span class="muted hint">Click column headers to sort</span>
  </div>
  <div class="table-wrap">
    <table id="hist-table" class="hist-table">
      <thead>
        <tr>
          <th>Char</th>
          <th>Code Point</th>
          <th>Count</th>
          <th>Status</th>
          <th>Replacement</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------------------------
// Diff rendering
// ---------------------------------------------------------------------------

/** Split charMappings into per-line arrays, splitting on \n in the original. */
function splitIntoLines(mappings: CharMapping[]): CharMapping[][] {
  const lines: CharMapping[][] = [];
  let current: CharMapping[] = [];
  for (const m of mappings) {
    current.push(m);
    if (m.original === "\n") {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

function renderLeftLine(line: CharMapping[]): string {
  let html = "";
  for (const m of line) {
    const display = esc(visChar(m.original));
    const cp = cpStr(m.originalCodePoint);

    if (m.original === "\n") {
      html += `<span class="eol" title="${esc(cp)}">${display}</span>`;
      continue;
    }
    if (m.unmapped) {
      html += `<span class="c-unmapped" title="${esc(cp)}: disallowed, not in map">${display}</span>`;
    } else if (m.mapped && m.replacement === "") {
      html += `<span class="c-deleted" title="${esc(cp)}: deleted (mapped to empty)">${display}</span>`;
    } else if (m.mapped) {
      html += `<span class="c-changed" title="${esc(cp)} → '${esc(m.replacement)}'">${display}</span>`;
    } else {
      html += display;
    }
  }
  return html;
}

function renderRightLine(line: CharMapping[]): string {
  let html = "";
  for (const m of line) {
    if (m.original === "\n") {
      if (!m.mapped || m.replacement.includes("\n")) {
        html += `<span class="eol">↵</span>`;
      }
      continue;
    }

    if (m.mapped && m.replacement === "") {
      continue; // deleted — nothing on right
    }

    const output = m.mapped ? m.replacement : m.original;

    if (m.illegalOutput) {
      html += `<span class="c-illegal" title="${esc(cpStr(m.originalCodePoint))}: illegal in output">${esc(output)}</span>`;
    } else if (m.mapped) {
      html += `<span class="c-changed">${esc(output)}</span>`;
    } else {
      html += esc(output);
    }
  }
  return html;
}

function renderDiffSection(range: RangeDiffData): string {
  const lines = splitIntoLines(range.charMappings);

  const rows = lines
    .map((line, i) => {
      const left = renderLeftLine(line);
      const right = renderRightLine(line);
      const notable = line.some((m) => m.mapped || m.unmapped || m.illegalOutput);
      const rowClass = notable ? " class=\"diff-row-notable\"" : "";
      return `<tr${rowClass}><td class="ln">${i + 1}</td><td class="diff-left">${left}</td><td class="diff-right">${right}</td></tr>`;
    })
    .join("\n");

  return `
  <div class="range-section">
    <h3 class="range-label">Range: ${esc(range.rangeLabel)}</h3>
    <div class="diff-wrap">
      <table class="diff-table">
        <thead>
          <tr>
            <th class="ln">#</th>
            <th>Original</th>
            <th>Normalized</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

const CSS = `
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin: 0; padding: 1.5rem 2rem 3rem;
  background: #f6f8fa; color: #1f2328;
  line-height: 1.5;
}
h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
h2 { font-size: 1rem; font-weight: 600; margin: 2rem 0 0.6rem; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3rem; }
h3.range-label { font-size: 0.85rem; color: #57606a; margin: 0.75rem 0 0.25rem; font-weight: 500; }

.meta { font-size: 0.8rem; color: #57606a; margin-bottom: 1.25rem; }
.meta strong { color: #1f2328; }
.badge { display: inline-block; padding: 0.15em 0.5em; border-radius: 2em; font-size: 0.75em; font-weight: 600; margin-left: 0.4em; }
.badge-applied  { background: #dafbe1; color: #116329; }
.badge-skipped  { background: #fff8c5; color: #7d4e00; }
.muted { color: #57606a; }
.hint { font-size: 0.8rem; }

/* Stats */
.stats-grid { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.stat-box {
  background: #fff; border: 1px solid #d0d7de; border-radius: 6px;
  padding: 0.65rem 1.25rem; min-width: 130px;
}
.stat-changed { border-left: 4px solid #bf8700; }
.stat-unmapped { border-left: 4px solid #cf222e; }
.stat-illegal  { border-left: 4px solid #a40e26; }
.stat-num { font-size: 1.65rem; font-weight: 700; line-height: 1.2; }
.stat-lbl { font-size: 0.73rem; color: #57606a; margin-top: 0.1rem; }

/* Legend */
.legend { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.8rem; margin: 0.75rem 0 1.5rem; }
.legend-item { display: flex; align-items: center; gap: 0.4rem; }
.legend-swatch {
  display: inline-block; width: 14px; height: 13px;
  border-radius: 3px; border: 1px solid rgba(0,0,0,0.12);
  flex-shrink: 0;
}

/* Highlight classes — used in both diff and histogram */
.c-changed  { background: #fff3cd; color: #6e4c00; border-radius: 2px; padding: 0 1px; }
.c-unmapped { background: #ffd7d9; color: #82071e; border-radius: 2px; padding: 0 1px; font-weight: 600; }
.c-illegal  { background: #ffd7d9; color: #82071e; border-radius: 2px; padding: 0 1px; font-weight: 600; }
.c-deleted  { background: #ffd7d9; color: #82071e; border-radius: 2px; padding: 0 1px; text-decoration: line-through; }
.eol        { color: #b0b7be; font-size: 0.7em; user-select: none; }

/* Histogram */
.hist-controls { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.4rem; }
.btn-sm {
  font-size: 0.8rem; padding: 0.2rem 0.65rem;
  border: 1px solid #d0d7de; border-radius: 6px;
  background: #f6f8fa; color: #1f2328; cursor: pointer;
}
.btn-sm:hover { background: #eaf0f6; }
.table-wrap { overflow-x: auto; margin-bottom: 0.5rem; }
.hist-table {
  border-collapse: collapse; width: 100%;
  background: #fff; font-size: 0.85rem;
  border: 1px solid #d0d7de; border-radius: 6px;
  overflow: hidden;
}
.hist-table th, .hist-table td {
  border: 1px solid #d0d7de; padding: 0.35rem 0.75rem; text-align: left;
}
.hist-table th {
  background: #f6f8fa; font-weight: 600; font-size: 0.8rem;
  cursor: pointer; white-space: nowrap; user-select: none;
}
.hist-table th:hover { background: #eaf0f6; }
.hist-table th.sort-asc::after  { content: " ↑"; }
.hist-table th.sort-desc::after { content: " ↓"; }
.hist-char  { font-family: monospace; font-size: 1rem; text-align: center; width: 3em; }
.hist-cp    { width: 7.5em; }
.hist-count { text-align: right; width: 5em; }
.mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
.repl { background: #f6f8fa; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
.hist-normal { display: none; }  /* hidden by default; toggled via JS */

/* Diff */
.range-section { margin-bottom: 2rem; }
.diff-wrap {
  overflow: auto; max-height: 70vh;
  border: 1px solid #d0d7de; border-radius: 6px;
  background: #fff;
}
.diff-table {
  border-collapse: collapse; width: 100%; table-layout: fixed;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.8rem;
}
.diff-table thead th {
  background: #f6f8fa; padding: 0.3rem 0.5rem;
  text-align: left; border-bottom: 2px solid #d0d7de;
  position: sticky; top: 0; z-index: 1; font-size: 0.78rem;
}
.diff-table td {
  padding: 0.1rem 0.5rem; vertical-align: top;
  border-bottom: 1px solid #f6f8fa;
  white-space: pre-wrap; word-break: break-all;
}
.diff-table .ln {
  color: #b0b7be; font-size: 0.72rem; text-align: right;
  width: 3.2em; user-select: none; border-right: 1px solid #eaeef2;
  padding-right: 0.4rem;
}
.diff-table .diff-left  { width: calc(50% - 1.6em); border-right: 1px solid #d0d7de; }
.diff-table .diff-right { width: calc(50% - 1.6em); }
.diff-table tr.diff-row-notable { background: #fffef0; }
`;

const JS = `
(function () {
  var sortCol = -1, sortAsc = true;

  function sortTable(idx) {
    var table = document.getElementById("hist-table");
    var tbody = table.querySelector("tbody");
    var rows = Array.from(tbody.rows);
    sortAsc = sortCol === idx ? !sortAsc : true;
    sortCol = idx;

    rows.sort(function (a, b) {
      var at = (a.cells[idx].getAttribute("data-sort") || a.cells[idx].textContent || "").trim();
      var bt = (b.cells[idx].getAttribute("data-sort") || b.cells[idx].textContent || "").trim();
      var an = parseFloat(at), bn = parseFloat(bt);
      var cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : at.localeCompare(bt);
      return sortAsc ? cmp : -cmp;
    });
    rows.forEach(function (r) { tbody.appendChild(r); });

    var ths = table.querySelectorAll("th");
    ths.forEach(function (th, i) {
      th.classList.remove("sort-asc", "sort-desc");
      if (i === idx) th.classList.add(sortAsc ? "sort-asc" : "sort-desc");
    });
  }

  document.querySelectorAll("#hist-table th").forEach(function (th, i) {
    th.addEventListener("click", function () { sortTable(i); });
  });

  document.getElementById("toggle-normal").addEventListener("click", function () {
    var rows = document.querySelectorAll(".hist-normal");
    var isHidden = rows.length > 0 && getComputedStyle(rows[0]).display === "none";
    rows.forEach(function (r) { r.style.display = isHidden ? "" : "none"; });
    this.textContent = isHidden ? "Hide normal rows" : "Show all rows";
  });
})();
`;

export function buildHtmlReport(data: ReportData): string {
  const allMappings = data.ranges.flatMap((r) => r.charMappings);
  const histSection = renderHistogram(allMappings);
  const diffSections = data.ranges.map(renderDiffSection).join("\n");

  const appliedBadge = data.editsApplied
    ? `<span class="badge badge-applied">edits applied</span>`
    : `<span class="badge badge-skipped">no edits applied</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Text Utils Report — ${esc(data.runId)}</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>Text Utils — Normalization Report${appliedBadge}</h1>
  <div class="meta">
    <strong>Document:</strong> ${esc(data.documentUri)}<br>
    <strong>Run ID:</strong> <span class="mono">${esc(data.runId)}</span> &nbsp;
    <strong>Timestamp:</strong> ${esc(data.timestamp)}
  </div>

  <h2>Summary</h2>
  ${histSection}

  <div class="legend">
    <div class="legend-item">
      <span class="legend-swatch" style="background:#fff3cd;"></span>
      Mapped / changed
    </div>
    <div class="legend-item">
      <span class="legend-swatch" style="background:#ffd7d9;"></span>
      Unmapped (needs review) · Illegal output · Deleted
    </div>
  </div>

  <h2>Side-by-Side Diff</h2>
  ${diffSections.trim() || "<p class=\"muted\">No ranges processed.</p>"}

  <script>${JS}</script>
</body>
</html>`;
}
