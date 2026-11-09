import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Sim } from './sim';
import { DL_G2_BASE, MachineProfile, cloneProfile } from './profile';
import { ChartSpec } from './chart';
import { prizeCenter } from './prizes';
import { add, scale, v3 } from './math';

type R = typeof RAPIER_NS;

/**
 * 物理測試（對應 proj-chat.md 的 Physics Test Suite）
 * 重要：這些測試比對的是「理論值／物理一致性」，不是真機錄影。
 * 真機對照需要實測資料（尚未取得）。
 */
export interface TestResult {
  id: string;
  name: string;
  passed: boolean | null; // null = 只有觀察、沒有驗收門檻
  summary: string;
  charts: ChartSpec[];
}

const run = (sim: Sim, seconds: number, each?: (sim: Sim) => void) => {
  const n = Math.round(seconds / sim.dt);
  for (let i = 0; i < n; i++) { sim.step(); each?.(sim); }
};

function lowerTo(sim: Sim, L: number) {
  const m = sim.machine;
  m.winchCmd = 1;
  while (m.cableLength < L) sim.step();
  m.winchCmd = 0;
}

function clawCOM(sim: Sim) {
  let mm = 0, c = v3();
  for (const b of sim.machine.allClawBodies()) { c = add(c, scale(b.translation(), b.mass())); mm += b.mass(); }
  return scale(c, 1 / mm);
}

// ------------------------------------------------------------------ T01
export function testT01(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const sim = new Sim(RAPIER, prof, 'empty');
  sim.firmwareEnabled = false;
  sim.machine.teleportTrolley(0.1, -0.1);
  const L = 0.45;
  lowerTo(sim, L);
  run(sim, 4);
  // 理論：小角度單擺，等效擺長 = 鋼索 L + 吊點到整組爪子質心距離
  const com = clawCOM(sim);
  const Leff = sim.machine.trolleyPos.y - com.y;
  const Tth = 2 * Math.PI * Math.sqrt(Leff / prof.physics.gravity);
  // 初速度給 ~2 cm 振幅
  const A = 0.02;
  const v0 = A * (2 * Math.PI / Tth);
  for (const b of sim.machine.allClawBodies()) b.setLinvel({ x: v0, y: 0, z: 0 }, true);
  const t: number[] = [], x: number[] = [];
  const t0 = sim.time;
  run(sim, 10, (s) => { t.push(s.time - t0); x.push(s.machine.head.translation().x - s.machine.trolleyPos.x); });
  // 上升零交越
  const zc: number[] = [];
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) zc.push(t[i - 1] + (t[i] - t[i - 1]) * (-x[i - 1] / (x[i] - x[i - 1])));
  const Tsim = zc.length >= 2 ? (zc.at(-1)! - zc[0]) / (zc.length - 1) : NaN;
  const err = Math.abs(Tsim - Tth) / Tth;
  // 振幅衰減（峰值）
  const peaks: number[] = [], peakT: number[] = [];
  for (let i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0) { peaks.push(x[i]); peakT.push(t[i]); }
  const zeta = peaks.length >= 3 ? Math.log(peaks[0] / peaks.at(-1)!) / (2 * Math.PI * (peaks.length - 1)) : NaN;
  const ds = (arr: number[]) => arr.filter((_, i) => i % 2 === 0);
  return {
    id: 'T01', name: '自由擺盪週期',
    passed: err <= 0.05,
    summary: `L=${L} m、等效擺長 ${Leff.toFixed(3)} m；理論週期 ${Tth.toFixed(3)} s，模擬 ${Tsim.toFixed(3)} s，誤差 ${(err * 100).toFixed(2)}%（門檻 ≤ 5%）。阻尼比 ζ≈${zeta.toFixed(3)}（暫定空氣阻尼）。`,
    charts: [{
      title: 'T01 自由擺盪：爪頭相對天車的 X 偏移',
      subtitle: `理論 T=${Tth.toFixed(3)} s｜模擬 T=${Tsim.toFixed(3)} s｜誤差 ${(err * 100).toFixed(2)}%`,
      xLabel: '時間（s）', yLabel: '偏移（mm）',
      series: [
        { name: '模擬', x: ds(t), y: ds(x).map((v) => v * 1000) },
        { name: '理論無阻尼單擺', x: ds(t), y: ds(t).map((tt) => A * 1000 * Math.sin((2 * Math.PI * tt) / Tth)), dashed: true },
      ],
    }],
  };
}

// ------------------------------------------------------------------ T02
export function testT02(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const sim = new Sim(RAPIER, prof, 'empty');
  sim.firmwareEnabled = false;
  sim.machine.teleportTrolley(-0.2, -0.1);
  lowerTo(sim, 0.3);
  run(sim, 3);
  const t: number[] = [], sw: number[] = [], tv: number[] = [];
  const t0 = sim.time;
  const rec = (s: Sim) => { t.push(s.time - t0); sw.push((s.machine.head.translation().x - s.machine.trolleyPos.x) * 1000); tv.push(s.machine.trolleyVel.x * 1000); };
  sim.machine.cmdX = 1;
  run(sim, 1.2, rec);
  sim.machine.cmdX = 0;
  const tStop = sim.time - t0;
  run(sim, 7, rec);
  // 停止後的峰值
  let peakAfter = 0;
  const after = sw.map((v, i) => ({ v, t: t[i] })).filter((p) => p.t > tStop);
  for (const p of after) peakAfter = Math.max(peakAfter, Math.abs(p.v));
  const lastSec = after.filter((p) => p.t > t.at(-1)! - 1).reduce((m, p) => Math.max(m, Math.abs(p.v)), 0);
  // 能量不得自行增加：停止後 1 s 起的每個峰值應遞減
  const pk: number[] = [];
  for (let i = 1; i < after.length - 1; i++) if (Math.abs(after[i].v) > Math.abs(after[i - 1].v) && Math.abs(after[i].v) >= Math.abs(after[i + 1].v)) pk.push(Math.abs(after[i].v));
  let mono = true;
  for (let i = 2; i < pk.length; i++) if (pk[i] > pk[i - 1] * 1.02 + 0.05) mono = false;
  const ds = (arr: number[]) => arr.filter((_, i) => i % 2 === 0);
  return {
    id: 'T02', name: '急停甩爪',
    passed: mono && lastSec < peakAfter,
    summary: `天車以 P=170 速度往右 1.2 s 後放開；停止後最大甩幅 ${peakAfter.toFixed(1)} mm，最後 1 s 剩 ${lastSec.toFixed(1)} mm；峰值${mono ? '單調遞減' : '出現非物理增加'}。甩幅大小取決於暫定的加減速度，需實機錄影校準。`,
    charts: [
      { title: 'T02 急停：爪頭相對天車的 X 偏移', subtitle: `t=${tStop.toFixed(2)} s 放開搖桿（煞車 ${prof.physics.trolleyBrake} m/s²）`, xLabel: '時間（s）', yLabel: '偏移（mm）', series: [{ name: '爪頭偏移', x: ds(t), y: ds(sw) }] },
      { title: 'T02 急停：天車速度', xLabel: '時間（s）', yLabel: '速度（mm/s）', series: [{ name: '天車 vx', x: ds(t), y: ds(tv) }], height: 220 },
    ],
  };
}

// ------------------------------------------------------------------ T04
export function testT04(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const sim = new Sim(RAPIER, prof, 'empty');
  sim.firmwareEnabled = false;
  sim.machine.teleportTrolley(0.15, -0.15);
  run(sim, 1);
  const t: number[] = [], T: number[] = [], hy: number[] = [], gap: number[] = [];
  const t0 = sim.time;
  sim.machine.winchCmd = 1;
  let maxRise = 0, contactY = Infinity;
  run(sim, 3.6, (s) => {
    const m = s.machine;
    t.push(s.time - t0);
    T.push(m.tension);
    const y = m.head.translation().y;
    hy.push(y * 1000);
    gap.push((m.cableLength - m.cableDistance()) * 1000);
    if (m.tension < 0.01 && contactY === Infinity) contactY = y;
    if (contactY !== Infinity) maxRise = Math.max(maxRise, y - contactY);
  });
  sim.machine.winchCmd = 0;
  const finalSlack = gap.at(-1)!;
  const negT = Math.min(...T);
  const ok = negT >= 0 && maxRise < 0.002 && finalSlack > 10;
  const ds = (arr: number[]) => arr.filter((_, i) => i % 2 === 0);
  return {
    id: 'T04', name: '放線鬆弛',
    passed: ok,
    summary: `爪子落到底板後繼續放線；最小張力 ${negT.toFixed(3)} N（不得 < 0）、觸底後爪頭最大上抬 ${(maxRise * 1000).toFixed(2)} mm（門檻 < 2 mm）、最終鬆弛 ${finalSlack.toFixed(0)} mm。`,
    charts: [
      { title: 'T04 放線鬆弛：鋼索張力', subtitle: '觸底後張力歸零，不會產生推力', xLabel: '時間（s）', yLabel: '張力（N）', series: [{ name: '張力', x: ds(t), y: ds(T) }], yMin: 0 },
      { title: 'T04 放線鬆弛：鋼索多放出的長度（L − d）', xLabel: '時間（s）', yLabel: '鬆弛量（mm）', series: [{ name: 'L − d', x: ds(t), y: ds(gap) }], height: 220 },
    ],
  };
}

// ------------------------------------------------------------------ T06/T07
function grabOnce(RAPIER: R, prof: MachineProfile, record = false) {
  const sim = new Sim(RAPIER, prof, 'single-box');
  sim.settle(1.5);
  const box = sim.prizes[0];
  const c0 = prizeCenter(box);
  sim.machine.teleportTrolley(c0.x, c0.z);
  run(sim, 2.5);
  const floorY = prof.cabinet.playFloorY;
  const y0 = c0.y;
  sim.pressDrop();
  const t: number[] = [], by: number[] = [], st: string[] = [], ang: number[] = [];
  let heightAtTopEnd = 0, maxH = 0, liftedThenDropped = false;
  let prev = sim.firmware.state;
  const t0 = sim.time;
  while (sim.time - t0 < 14) {
    sim.step();
    const h = prizeCenter(box).y - y0;
    maxH = Math.max(maxH, h);
    if (record && Math.round((sim.time - t0) / sim.dt) % 2 === 0) { t.push(sim.time - t0); by.push(h * 1000); st.push(sim.firmware.state); ang.push(sim.telemetry.at(-1)!.legAngle); }
    if (prev === 'top' && sim.firmware.state === 'return') heightAtTopEnd = h;
    if (prev !== 'aim' && sim.firmware.state === 'aim') break;
    prev = sim.firmware.state;
  }
  if (maxH > 0.15 && heightAtTopEnd < 0.05) liftedThenDropped = true;
  void floorY;
  return { held: heightAtTopEnd > 0.15, heightAtTopEnd, maxH, liftedThenDropped, won: box.won, t, by, st, ang };
}

export function testT06(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const Ps = [60, 100, 140, 180, 220, 255];
  const maxH: number[] = [], topH: number[] = [];
  for (const P of Ps) {
    const pr = cloneProfile(prof);
    pr.controller.P1 = P; pr.controller.P2 = P; pr.controller.P3 = P; pr.controller.P4 = P;
    const r = grabOnce(RAPIER, pr);
    maxH.push(r.maxH * 1000);
    topH.push(r.heightAtTopEnd * 1000);
  }
  const threshold = Ps.find((_, i) => topH[i] > 150);
  // 單調性：爪力越大，頂端保持高度不應明顯變低
  let mono = true;
  for (let i = 1; i < Ps.length; i++) if (topH[i] < topH[i - 1] - 30 && topH[i - 1] > 150) mono = false;
  return {
    id: 'T06', name: '三爪捏盒：爪力掃描',
    passed: mono ? null : false,
    summary: `標準透明盒（0.23 kg，假設值）置中；P1=P2=P3=P 固定。${threshold ? `P ≥ ${threshold} 時能撐到頂部停留結束` : '所有爪力都無法撐到頂部'}。滑脫門檻由接觸力與摩擦自然產生，沒有設定成功率。真機門檻需測力計實測（尚未取得），故不判定通過。`,
    charts: [{
      title: 'T06 爪力掃描：硬盒被抬起的高度', subtitle: '每個點是一次完整夾取；虛線 = 抬離底板 150 mm',
      xLabel: '爪力控制值 P（0~255）', yLabel: '高度（mm）', markers: true,
      series: [{ name: '最大高度', x: Ps, y: maxH }, { name: '頂部停留結束時', x: Ps, y: topH }],
      hLines: [{ y: 150, label: '150 mm' }],
    }],
  };
}

export function testT07(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const r = grabOnce(RAPIER, prof, true);
  const c = prof.controller;
  return {
    id: 'T07', name: '原廠爪力時序（P1→P2→P3）',
    passed: null,
    summary: `原廠設定 P1=${c.P1}/P2=${c.P2}/P3=${c.P3}：最大抬升 ${(r.maxH * 1000).toFixed(0)} mm，頂部停留結束時 ${(r.heightAtTopEnd * 1000).toFixed(0)} mm${r.liftedThenDropped ? '，盒子在降爪力後自然滑落（未刪除任何夾持約束）' : ''}。`,
    charts: [
      { title: 'T07 原廠時序：硬盒高度', subtitle: '高度相對初始位置', xLabel: '時間（s）', yLabel: '高度（mm）', series: [{ name: '盒子高度', x: r.t, y: r.by }] },
      { title: 'T07 原廠時序：三爪平均閉合角', xLabel: '時間（s）', yLabel: '角度（rad）', series: [{ name: '閉合角', x: r.t, y: r.ang }], height: 220 },
    ],
  };
}

// ------------------------------------------------------------------ T11
export function testT11(RAPIER: R, prof: MachineProfile = DL_G2_BASE): TestResult {
  const sim = new Sim(RAPIER, prof, 'standard');
  sim.firmwareEnabled = false;
  const t: number[] = [], ke: number[] = [];
  let minY = Infinity;
  run(sim, 30, (s) => {
    if (Math.round(s.time / s.dt) % 6 === 0) { t.push(s.time); ke.push(s.kineticEnergy() * 1000); }
    for (const p of s.prizes) for (const pt of p.parts) minY = Math.min(minY, pt.body.translation().y);
  });
  const tail = ke.filter((_, i) => t[i] > 10);
  const maxTail = Math.max(...tail);
  const penetr = minY < prof.cabinet.playFloorY - 0.005;
  const ok = maxTail < 1 && !penetr;
  return {
    id: 'T11', name: '長時間靜置穩定',
    passed: ok,
    summary: `標準擺台靜置 30 s：10 s 後最大總動能 ${maxTail.toFixed(4)} mJ（門檻 < 1 mJ）；最低部件 y=${minY.toFixed(3)} m（底板 ${prof.cabinet.playFloorY} m）${penetr ? '，有穿模！' : '，無穿模'}。`,
    charts: [{ title: 'T11 靜置：系統總動能', subtitle: '不得出現持續的能量增加', xLabel: '時間（s）', yLabel: '動能（mJ）', series: [{ name: '總動能', x: t, y: ke }], yMin: 0 }],
  };
}

export const ALL_TESTS = [testT01, testT02, testT04, testT06, testT07, testT11];
