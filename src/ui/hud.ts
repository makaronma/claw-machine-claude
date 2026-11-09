import type { Sim, Telemetry } from '../sim/sim';
import { ChartSpec, chartFrame, fmtNum, lineChartSVG } from '../sim/chart';
import type { TestResult } from '../sim/tests';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * 即時遙測：三張小圖（各自一個 Y 軸，不用雙軸）＋滑鼠十字線讀值。
 */
export class TelemetryPanel {
  private ctx: CanvasRenderingContext2D;
  private hoverX: number | null = null;
  windowSec = 10;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); this.hoverX = e.clientX - r.left; });
    canvas.addEventListener('pointerleave', () => { this.hoverX = null; });
  }

  draw(sim: Sim) {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const tel = sim.telemetry;
    if (!tel.length) return;
    const tEnd = tel[tel.length - 1].t;
    const tStart = tEnd - this.windowSec;
    const data = tel.filter((d) => d.t >= tStart);
    const rows: { title: string; unit: string; series: { name: string; get: (d: Telemetry) => number; color: string }[] }[] = [
      { title: '鋼索張力', unit: 'N', series: [{ name: '張力', get: (d) => d.tension, color: css('--s1') }] },
      { title: '電磁力（鐵芯）', unit: 'N', series: [{ name: '電磁力', get: (d) => d.solenoidForce, color: css('--s1') }] },
      { title: '爪頭擺幅（相對天車）', unit: 'mm', series: [{ name: 'X', get: (d) => d.swingX * 1000, color: css('--s1') }, { name: 'Z', get: (d) => d.swingZ * 1000, color: css('--s2') }] },
    ];
    const rowH = H / rows.length;
    const ml = 40, mr = 8;
    const pw = W - ml - mr;
    const X = (t: number) => ml + ((t - tStart) / this.windowSec) * pw;
    const ink = css('--ink'), ink2 = css('--ink2'), grid = css('--grid');
    let hoverD: Telemetry | null = null;
    if (this.hoverX !== null && this.hoverX > ml) {
      const t = tStart + ((this.hoverX - ml) / pw) * this.windowSec;
      hoverD = data.reduce((best, d) => (Math.abs(d.t - t) < Math.abs(best.t - t) ? d : best), data[0]);
    }
    rows.forEach((row, ri) => {
      const top = ri * rowH + 16, bot = (ri + 1) * rowH - 6;
      const vals = row.series.flatMap((s) => data.map(s.get));
      let lo = Math.min(0, ...vals), hi = Math.max(...vals, 1e-3);
      if (row.unit === 'mm') { const a = Math.max(5, ...vals.map(Math.abs)); lo = -a; hi = a; }
      const Y = (v: number) => bot - ((v - lo) / (hi - lo || 1)) * (bot - top);
      g.font = '600 11px system-ui, sans-serif';
      g.fillStyle = ink;
      g.fillText(`${row.title}（${row.unit}）`, ml, top - 4);
      // 格線
      g.strokeStyle = grid; g.lineWidth = 1;
      for (const v of [lo, (lo + hi) / 2, hi]) {
        g.beginPath(); g.moveTo(ml, Y(v)); g.lineTo(W - mr, Y(v)); g.stroke();
        g.fillStyle = ink2; g.font = '10px system-ui, sans-serif';
        g.textAlign = 'right'; g.fillText(fmtNum(+v.toFixed(2)), ml - 4, Y(v) + 3); g.textAlign = 'left';
      }
      for (const s of row.series) {
        g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath();
        data.forEach((d, i) => { const x = X(d.t), y = Y(s.get(d)); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
        g.stroke();
      }
      if (row.series.length > 1) {
        let lx = W - mr;
        for (const s of [...row.series].reverse()) {
          g.font = '10.5px system-ui, sans-serif';
          const tw = g.measureText(s.name).width;
          lx -= tw + 20;
          g.strokeStyle = s.color; g.lineWidth = 2;
          g.beginPath(); g.moveTo(lx, top - 8); g.lineTo(lx + 12, top - 8); g.stroke();
          g.fillStyle = ink; g.fillText(s.name, lx + 15, top - 4);
        }
      }
      if (hoverD) {
        const x = X(hoverD.t);
        g.strokeStyle = ink2; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
        for (const s of row.series) {
          g.fillStyle = s.color;
          g.beginPath(); g.arc(x, Y(s.get(hoverD)), 4, 0, Math.PI * 2); g.fill();
          g.strokeStyle = css('--panel'); g.lineWidth = 2; g.stroke();
        }
        const txt = row.series.map((s) => `${s.name} ${s.get(hoverD!).toFixed(2)}`).join('  ');
        g.font = '10.5px system-ui, sans-serif';
        const tw = g.measureText(txt).width;
        const bx = Math.min(x + 8, W - tw - 12);
        g.fillStyle = css('--panel'); g.fillRect(bx - 4, top + 2, tw + 8, 16);
        g.fillStyle = ink; g.fillText(txt, bx, top + 14);
      }
    });
    g.fillStyle = ink2; g.font = '10px system-ui, sans-serif';
    g.fillText(`最近 ${this.windowSec} 秒（模擬時間）`, ml, H - 1);
  }
}

/** 物理測試結果浮層；圖表附十字線 hover 讀值 */
export function showTestResults(container: HTMLElement, results: TestResult[]) {
  container.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tests-head';
  head.innerHTML = `<h2>物理測試結果</h2><p>比對對象為<b>理論值與物理一致性</b>，不是真機實測；未實測參數皆為暫定值。</p>`;
  container.appendChild(head);
  for (const r of results) {
    const sec = document.createElement('section');
    const tag = r.passed === null ? ['觀察', 'obs'] : r.passed ? ['PASS', 'pass'] : ['FAIL', 'fail'];
    sec.innerHTML = `<h3><span class="tag ${tag[1]}">${tag[0]}</span>${r.id} ${r.name}</h3><p>${r.summary}</p>`;
    for (const spec of r.charts) sec.appendChild(chartWithHover(spec));
    container.appendChild(sec);
  }
}

function chartWithHover(spec: ChartSpec): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.innerHTML = lineChartSVG(spec);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  wrap.appendChild(tip);
  const svg = wrap.querySelector('svg')!;
  const f = chartFrame(spec);
  const cross = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  cross.setAttribute('stroke', 'currentColor');
  cross.setAttribute('stroke-opacity', '0.4');
  cross.setAttribute('y1', String(f.m.t));
  cross.setAttribute('y2', String(f.m.t + f.ph));
  cross.style.display = 'none';
  svg.appendChild(cross);
  // 命中區比線條大：整個繪圖區
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * f.W;
    if (sx < f.m.l || sx > f.m.l + f.pw) { cross.style.display = 'none'; tip.style.display = 'none'; return; }
    const xv = f.x0 + ((sx - f.m.l) / f.pw) * (f.x1 - f.x0);
    const lines: string[] = [];
    let px = sx;
    spec.series.forEach((s) => {
      let bi = 0;
      for (let i = 1; i < s.x.length; i++) if (Math.abs(s.x[i] - xv) < Math.abs(s.x[bi] - xv)) bi = i;
      px = f.X(s.x[bi]);
      lines.push(`${s.name}：${fmtNum(+s.y[bi].toFixed(3))}`);
      if (lines.length === 1) lines.unshift(`${spec.xLabel}：${fmtNum(+s.x[bi].toFixed(3))}`);
    });
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.style.display = '';
    tip.innerHTML = lines.join('<br>');
    tip.style.display = 'block';
    const left = (px / f.W) * r.width;
    tip.style.left = `${Math.min(left + 10, r.width - 160)}px`;
    tip.style.top = `${(f.m.t / f.H) * r.height}px`;
  });
  svg.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.style.display = 'none'; });
  return wrap;
}
