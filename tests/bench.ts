// 物理效能基準：各擺台在穩定後的每步耗時
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim/sim';
import { DL_G2_BASE, cloneProfile } from '../src/sim/profile';
import { prizeCenter } from '../src/sim/prizes';
await RAPIER.init();
const out: Record<string, number> = {};
for (const layout of ['standard', 'feet', 'tailgroove']) {
  const sim = new Sim(RAPIER, cloneProfile(DL_G2_BASE), layout);
  let t0 = performance.now(); sim.settle(2.5); const settleMs = performance.now() - t0;
  // 閒置（瞄準中）
  t0 = performance.now(); for (let i = 0; i < 600; i++) sim.step(); const idle = (performance.now() - t0) / 600;
  // 夾取中（爪子與獎品互動）
  const p = sim.prizes.find((q) => q.kind === 'plush')!; const c = prizeCenter(p);
  sim.machine.teleportTrolley(c.x, c.z); sim.pressDrop();
  t0 = performance.now(); for (let i = 0; i < 1200; i++) sim.step(); const grab = (performance.now() - t0) / 1200;
  console.log(`${layout.padEnd(11)} settle ${settleMs.toFixed(0)} ms | idle ${idle.toFixed(3)} ms/step | grab ${grab.toFixed(3)} ms/step`);
  out[`${layout}-settle`] = settleMs; out[`${layout}-idle`] = idle; out[`${layout}-grab`] = grab;
  sim.dispose();
}
console.log(JSON.stringify(out));
