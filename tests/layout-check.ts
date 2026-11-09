// 擺台健檢：落定時間、是否穿模／飛出、何時完全靜止、每步耗時
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim/sim';
import { DL_G2_BASE, cloneProfile } from '../src/sim/profile';
import { LAYOUTS } from '../src/sim/layouts';
import { prizeCenter } from '../src/sim/prizes';
await RAPIER.init();
let bad = 0;
for (const L of LAYOUTS) {
  const sim = new Sim(RAPIER, cloneProfile(DL_G2_BASE), L.id);
  const start = sim.prizes.map((p) => prizeCenter(p));
  const t0 = performance.now(); sim.settle(2.5); const settleMs = performance.now() - t0;
  let quietAt = -1;
  const t1 = performance.now();
  for (let i = 0; i < 120 * 15; i++) { sim.step(); if (quietAt < 0 && sim.isQuiet()) quietAt = sim.time; }
  const stepMs = (performance.now() - t1) / (120 * 15);
  const c = sim.prof.cabinet;
  const issues: string[] = [];
  sim.prizes.forEach((p, i) => {
    const q = prizeCenter(p);
    const moved = Math.hypot(q.x - start[i].x, q.z - start[i].z);
    if (!p.won && (q.y < c.playFloorY - 0.01 || q.x < c.playMinX - 0.02 || q.x > c.playMaxX + 0.02 || q.z < c.playMinZ - 0.02 || q.z > c.playMaxZ + 0.02)) issues.push(`${p.label} 出界 (${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)})`);
    if (moved > 0.12 && !p.won && L.id !== 'plushmountain') issues.push(`${p.label} 偏移 ${(moved * 100).toFixed(0)}cm`);
  });
  const wonAtLoad = sim.prizes.filter((p) => p.won).length;
  if (issues.length || quietAt < 0) bad++;
  console.log(`${L.id.padEnd(14)} 物件 ${String(sim.prizes.length).padStart(2)}｜settle ${settleMs.toFixed(0)}ms｜靜止於 ${quietAt < 0 ? '未靜止' : quietAt.toFixed(1) + 's'}｜${stepMs.toFixed(3)} ms/step｜開局即出貨 ${wonAtLoad}${issues.length ? '｜⚠ ' + issues.join('；') : ''}`);
  sim.dispose();
}
process.exit(bad ? 1 : 0);
