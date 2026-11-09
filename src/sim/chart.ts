/**
 * 純字串 SVG 折線圖（Node 與瀏覽器共用）。
 * 規則：單一 Y 軸、2px 線、髮絲格線、最多 3 條序列（類別色 slot 1~3，已驗證）、
 * 有圖例＋線尾直接標籤；文字一律用文字色，不用序列色。
 */
export interface Series { name: string; x: number[]; y: number[]; dashed?: boolean }
export interface ChartSpec {
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  series: Series[];
  hLines?: { y: number; label: string }[]; // 參考線（理論值、門檻）
  yMin?: number; yMax?: number;
  width?: number; height?: number;
  markers?: boolean;
}

export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70'];

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) { hi = lo + 1; }
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}
const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return (+v.toFixed(2)).toString();
  if (a >= 0.01) return (+v.toFixed(3)).toString();
  return v.toExponential(1);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function chartFrame(spec: ChartSpec) {
  const W = spec.width ?? 640, H = spec.height ?? 320;
  const m = { l: 58, r: 110, t: 52, b: 46 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xs = spec.series.flatMap((s) => s.x);
  const ys = spec.series.flatMap((s) => s.y).concat((spec.hLines ?? []).map((h) => h.y));
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = spec.yMin ?? Math.min(...ys), y1 = spec.yMax ?? Math.max(...ys);
  if (x0 === x1) x1 = x0 + 1;
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.06;
  if (spec.yMin === undefined) y0 -= pad;
  if (spec.yMax === undefined) y1 += pad;
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0)) * pw;
  const Y = (v: number) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;
  return { W, H, m, pw, ph, x0, x1, y0, y1, X, Y };
}
export const fmtNum = (v: number) => fmt(v);

export function lineChartSVG(spec: ChartSpec): string {
  const { W, H, m, pw, ph, x0, x1, y0, y1, X, Y } = chartFrame(spec);
  const xt = niceTicks(x0, x1, 6), yt = niceTicks(y0, y1, 5);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" class="viz-root" font-family="system-ui, -apple-system, 'Noto Sans TC', sans-serif">`;
  s += `<style>
    .viz-root{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e6e5e0;--s1:${SERIES_LIGHT[0]};--s2:${SERIES_LIGHT[1]};--s3:${SERIES_LIGHT[2]};}
    @media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .viz-root{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--grid:#33332f;--s1:${SERIES_DARK[0]};--s2:${SERIES_DARK[1]};--s3:${SERIES_DARK[2]};}}
    :root[data-theme="dark"] .viz-root{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--grid:#33332f;--s1:${SERIES_DARK[0]};--s2:${SERIES_DARK[1]};--s3:${SERIES_DARK[2]};}
  </style>`;
  s += `<rect width="${W}" height="${H}" fill="var(--surface)"/>`;
  s += `<text x="${m.l}" y="22" font-size="15" font-weight="600" fill="var(--ink)">${esc(spec.title)}</text>`;
  if (spec.subtitle) s += `<text x="${m.l}" y="40" font-size="11.5" fill="var(--ink2)">${esc(spec.subtitle)}</text>`;
  for (const t of yt) {
    if (t < y0 || t > y1) continue;
    s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)" stroke-width="1"/>`;
    s += `<text x="${m.l - 8}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="var(--ink2)">${fmt(t)}</text>`;
  }
  for (const t of xt) {
    if (t < x0 || t > x1) continue;
    s += `<text x="${X(t)}" y="${m.t + ph + 18}" font-size="11" text-anchor="middle" fill="var(--ink2)">${fmt(t)}</text>`;
  }
  s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="var(--ink2)" stroke-width="1"/>`;
  s += `<text x="${m.l + pw / 2}" y="${H - 8}" font-size="11.5" text-anchor="middle" fill="var(--ink2)">${esc(spec.xLabel)}</text>`;
  s += `<text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" font-size="11.5" text-anchor="middle" fill="var(--ink2)">${esc(spec.yLabel)}</text>`;
  for (const h of spec.hLines ?? []) {
    s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="4 4"/>`;
    s += `<text x="${m.l + pw + 6}" y="${Y(h.y) + 4}" font-size="10.5" fill="var(--ink2)">${esc(h.label)}</text>`;
  }
  spec.series.forEach((ser, i) => {
    const color = `var(--s${(i % 3) + 1})`;
    const pts = ser.x.map((x, k) => `${X(x).toFixed(1)},${Y(ser.y[k]).toFixed(1)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${ser.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    if (spec.markers) {
      ser.x.forEach((x, k) => {
        s += `<circle cx="${X(x)}" cy="${Y(ser.y[k])}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"><title>${esc(ser.name)}: x=${fmt(x)}, y=${fmt(ser.y[k])}</title></circle>`;
      });
    }
    // 線尾直接標籤（文字色 + 色塊）
    const lx = ser.x.at(-1)!, ly = ser.y.at(-1)!;
    if (spec.series.length <= 4) {
      const yy = Y(ly) + 4 + i * 0; // 收斂時交由圖例辨識
      s += `<line x1="${m.l + pw + 6}" x2="${m.l + pw + 16}" y1="${yy - 4}" y2="${yy - 4}" stroke="${color}" stroke-width="2"/>`;
      s += `<text x="${m.l + pw + 20}" y="${yy}" font-size="10.5" fill="var(--ink)">${esc(fmt(ly))}</text>`;
    }
    void lx;
  });
  // 圖例（≥ 2 條序列）
  if (spec.series.length >= 2) {
    let lx = m.l + pw;
    const items = spec.series.map((ser, i) => ({ ser, i, w: ser.name.length * 11 + 26 }));
    for (const it of items.reverse()) {
      lx -= it.w;
      const color = `var(--s${(it.i % 3) + 1})`;
      s += `<line x1="${lx}" x2="${lx + 14}" y1="${m.t - 10}" y2="${m.t - 10}" stroke="${color}" stroke-width="2"${it.ser.dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
      s += `<text x="${lx + 18}" y="${m.t - 6}" font-size="11" fill="var(--ink)">${esc(it.ser.name)}</text>`;
    }
  }
  s += `</svg>`;
  return s;
}
