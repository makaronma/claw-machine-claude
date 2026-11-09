// 在 Node 執行物理測試，輸出 reports/physics-report.html 與每張圖的 SVG
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_TESTS } from '../src/sim/tests';
import { lineChartSVG } from '../src/sim/chart';

await RAPIER.init();
mkdirSync('reports', { recursive: true });
const only = process.argv.slice(2);
const results = [];
for (const fn of ALL_TESTS) {
  const t0 = performance.now();
  const r = fn(RAPIER);
  if (only.length && !only.includes(r.id)) continue;
  const ms = performance.now() - t0;
  const tag = r.passed === null ? 'OBSERVE' : r.passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${r.id} ${r.name} (${ms.toFixed(0)} ms)\n    ${r.summary}`);
  r.charts.forEach((c, i) => writeFileSync(`reports/${r.id}-${i + 1}.svg`, lineChartSVG(c)));
  results.push({ ...r, ms });
}
const stamp = new Date().toLocaleString('zh-TW', { hour12: false });
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>物理測試報告</title><style>
:root{--bg:#f4f3ef;--card:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--pass:#0a7d32;--fail:#c0262d;--obs:#8a6d00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121211;--card:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--pass:#4cc46b;--fail:#ff6b6b;--obs:#e5bf3c}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:20px}section{background:var(--card);border-radius:10px;padding:16px;margin:16px 0}
.tag{font-weight:700;font-size:12px;padding:2px 8px;border-radius:4px;border:1px solid currentColor;margin-right:8px}
.PASS{color:var(--pass)}.FAIL{color:var(--fail)}.OBSERVE{color:var(--obs)}p{color:var(--ink2);line-height:1.55;font-size:14px}
</style></head><body><main><h1>DL-G2-BASE 物理測試報告</h1><p>產生時間：${stamp}。比對對象為理論值與物理一致性，<b>不是真機實測</b>；未實測參數皆為暫定值。</p>
${results.map((r) => { const tag = r.passed === null ? 'OBSERVE' : r.passed ? 'PASS' : 'FAIL'; return `<section><h2 style="font-size:16px"><span class="tag ${tag}">${tag === 'OBSERVE' ? '觀察' : tag}</span>${r.id} ${r.name}</h2><p>${r.summary}</p>${r.charts.map((c) => lineChartSVG(c)).join('')}</section>`; }).join('')}
</main></body></html>`;
writeFileSync('reports/physics-report.html', html);
writeFileSync('reports/results.json', JSON.stringify(results.map(({ charts, ...r }) => r), null, 2));
console.log('\n→ reports/physics-report.html');
