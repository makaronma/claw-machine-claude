// 效能優化前後對照圖：reports/perf-report.html（資料：reports/perf-data.json）
import { readFileSync, writeFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('reports/perf-data.json', 'utf8'));
const S1 = '#2a78d6', S2 = '#eb6834';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** 水平分組長條圖（單一數值軸、兩序列：優化前／優化後） */
function groupedBars(title: string, subtitle: string, unit: string, rows: { label: string; before: number; after: number }[]) {
  const W = 720, rowH = 46, top = 74, left = 150, right = 90;
  const H = top + rows.length * rowH + 40;
  const max = Math.max(...rows.flatMap((r) => [r.before, r.after])) * 1.08;
  const X = (v: number) => left + (v / max) * (W - left - right);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="system-ui,-apple-system,'Noto Sans TC',sans-serif">`;
  s += `<rect width="${W}" height="${H}" fill="#fcfcfb"/>`;
  s += `<text x="16" y="26" font-size="16" font-weight="700" fill="#0b0b0b">${esc(title)}</text>`;
  s += `<text x="16" y="46" font-size="12" fill="#52514e">${esc(subtitle)}</text>`;
  // 圖例
  s += `<rect x="${W - 210}" y="56" width="12" height="12" rx="2" fill="${S1}"/><text x="${W - 194}" y="66" font-size="12" fill="#0b0b0b">優化前</text>`;
  s += `<rect x="${W - 130}" y="56" width="12" height="12" rx="2" fill="${S2}"/><text x="${W - 114}" y="66" font-size="12" fill="#0b0b0b">優化後</text>`;
  // 格線
  for (let i = 0; i <= 4; i++) {
    const v = (max / 1.08) * (i / 4);
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${top - 4}" y2="${H - 30}" stroke="#e6e5e0"/>`;
    s += `<text x="${X(v)}" y="${H - 14}" font-size="11" text-anchor="middle" fill="#52514e">${+v.toFixed(2)}</text>`;
  }
  s += `<text x="${W - right}" y="${H - 2}" font-size="11" text-anchor="end" fill="#52514e">${esc(unit)}</text>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    s += `<text x="${left - 10}" y="${y + 22}" font-size="12.5" text-anchor="end" fill="#0b0b0b">${esc(r.label)}</text>`;
    for (const [k, v, col] of [[0, r.before, S1], [1, r.after, S2]] as const) {
      const yy = y + 4 + k * 19;
      const w = Math.max(2, X(v) - left);
      s += `<path d="M${left},${yy} h${w - 4} a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h-${w - 4} z" fill="${col}"><title>${esc(r.label)} ${k ? '優化後' : '優化前'}：${v} ${esc(unit)}</title></path>`;
      s += `<text x="${left + w + 6}" y="${yy + 12}" font-size="11.5" fill="#0b0b0b">${+v.toFixed(3)}</text>`;
    }
    if (r.before > 0) s += `<text x="${W - 8}" y="${y + 22}" font-size="12" font-weight="700" text-anchor="end" fill="#0b0b0b">${r.after < r.before ? '−' + Math.round((1 - r.after / r.before) * 100) + '%' : '+' + Math.round((r.after / r.before - 1) * 100) + '%'}</text>`;
  });
  return s + '</svg>';
}

const p = d.physicsMsPerStep;
const lab: Record<string, string> = { 'standard-idle': '標準擺台・閒置', 'standard-grab': '標準擺台・夾取中', 'feet-idle': '腳撐洞口・閒置', 'feet-grab': '腳撐洞口・夾取中', 'tailgroove-idle': '尾巴凹槽・閒置', 'tailgroove-grab': '尾巴凹槽・夾取中' };
const physRows = Object.keys(lab).map((k) => ({ label: lab[k], before: p.before[k], after: p.after[k] }));
const settleRows = Object.keys(d.settleMs.before).map((k) => ({ label: { standard: '標準擺台', feet: '腳撐洞口', tailgroove: '尾巴凹槽' }[k as 'standard'] ?? k, before: d.settleMs.before[k], after: d.settleMs.after[k] }));
const b = d.browser;
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>效能優化報告</title>
<style>body{margin:0;background:#f4f3ef;font-family:system-ui,'Noto Sans TC',sans-serif;color:#0b0b0b}main{max-width:760px;margin:0 auto;padding:20px 16px}section{background:#fcfcfb;border-radius:10px;padding:8px;margin:14px 0}p{color:#52514e;font-size:13.5px;line-height:1.55}</style></head><body><main>
<h1 style="font-size:20px">效能優化前後對照（${d.measuredAt}）</h1>
<p>物理：${esc(p.note)}。瀏覽器：${esc(b.note)}。</p>
<section>${groupedBars('物理每步耗時（越低越好）', '主要來自：全域 solver 32→8 次＋只對爪子加 24 次、靜止獎品自動睡眠', 'ms／step', physRows)}</section>
<section>${groupedBars('擺台載入：落定 2.5 秒模擬所需時間', '網頁開啟或換擺台時的等待時間', 'ms', settleRows)}</section>
<section>${groupedBars('瀏覽器：每幀 draw call 數（同一場景內容）', '靜態幾何合併、材質／貼圖共用', '次', [{ label: 'draw calls', before: b.drawCalls.before, after: b.drawCalls.after }])}</section>
<section>${groupedBars('瀏覽器：畫面靜止時每 5 秒重繪次數', '完全靜止時跳過渲染與陰影更新（省電）', '次', [{ label: '靜止 5 秒', before: b.rendersPer5sIdle.before, after: b.rendersPer5sIdle.after }])}</section>
</main></body></html>`;
writeFileSync('reports/perf-report.html', html);
console.log('→ reports/perf-report.html');
