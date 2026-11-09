import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { BOX_SPECS, BoxArt, PlushSpec, PrizeInstance, spawnBox, spawnPlush } from './prizes';
import type { MachineProfile } from './profile';
import { qEuler, v3 } from './math';

type R = typeof RAPIER_NS;

/**
 * 擺台 Presets（Prize Arrangement）
 * 只決定「初始擺放」，結果完全交給物理；不設定任何成功機率。
 * 載入後會先讓物理運行到穩定，再交給玩家。
 *
 * 洞口在左前角：x ∈ [-0.36, -0.11]，z ∈ [0.05, 0.30]
 * 擋板沿 x = -0.11 與 z = 0.05 兩條邊。
 */
export interface LayoutInfo { id: string; name: string; desc: string }
export const LAYOUTS: LayoutInfo[] = [
  { id: 'standard', name: '標準散鋪＋正門槍位', desc: '彩盒與布偶平鋪，洞口右側擺一個 3C 彩盒當槍位' },
  { id: 'feet', name: '腳撐洞口（二樓）', desc: '熊熊坐在長盒上，雙腳搭在擋板頂端；重心仍在檯面內' },
  { id: 'tailgroove', name: '恐龍尾巴凹槽', desc: '兩隻恐龍尾巴貼著擋板形成凹槽，中間夾一隻圓熊' },
  { id: 'single-box', name: '單一硬盒（物理測試）', desc: '只有一個標準透明盒，用於夾取／滑脫測試' },
];

export function buildLayout(RAPIER: R, world: RAPIER_NS.World, prof: MachineProfile, id: string): PrizeInstance[] {
  const fy = prof.cabinet.playFloorY;
  const out: PrizeInstance[] = [];
  const box = (art: BoxArt, x: number, z: number, opts: { yaw?: number; lie?: 'flat' | 'side' | 'stand'; y?: number } = {}) => {
    const spec = BOX_SPECS[art];
    const lie = opts.lie ?? 'stand';
    // stand：H 朝上；flat：D 朝上（平躺）；side：W 朝上（側躺）
    const rx = lie === 'flat' ? Math.PI / 2 : 0;
    const rz = lie === 'side' ? Math.PI / 2 : 0;
    const up = lie === 'stand' ? spec.size.y : lie === 'flat' ? spec.size.z : spec.size.x;
    const y = (opts.y ?? fy) + up / 2 + 0.002;
    out.push(spawnBox(RAPIER, world, spec, { pos: v3(x, y, z), rot: qEuler(rx, opts.yaw ?? 0, rz) }));
  };
  const plush = (spec: Omit<PlushSpec, 'kind'>, x: number, z: number, yaw: number, y = fy + 0.004) => {
    out.push(spawnPlush(RAPIER, world, { kind: 'plush', ...spec }, { pos: v3(x, y, z), rot: qEuler(0, yaw, 0) }));
  };
  const bearM = { plush: 'bear' as const, label: '團團熊（中）', scale: 1.0, color: 0xe9c39b, accent: 0xf5e3cf };
  const bearS = { plush: 'bear' as const, label: '團團熊（小）', scale: 0.8, color: 0xf2a7bb, accent: 0xfbe0e8 };
  const dinoG = { plush: 'dino' as const, label: '長尾小恐龍（綠）', scale: 1.0, color: 0x7cc576, accent: 0xf3d36b };
  const dinoB = { plush: 'dino' as const, label: '長尾小恐龍（藍）', scale: 1.0, color: 0x6fa8dc, accent: 0xf3d36b };
  const longcat = { plush: 'longcat' as const, label: '長條貓抱枕', scale: 1.0, color: 0xf6f1e7, accent: 0x9a8f86 };

  switch (id) {
    case 'standard':
      box('earbuds', -0.05, 0.2, { yaw: 0.15 });
      box('figure', -0.24, -0.06, { yaw: 0.05 });
      box('thin', 0.06, 0.04, { lie: 'flat', yaw: 0.3 });
      box('fan', 0.2, -0.06, { lie: 'flat', yaw: -0.4 });
      box('long', 0.12, -0.26, { lie: 'stand', yaw: 0.2 });
      box('blind', -0.06, -0.08);
      box('blind', 0.28, 0.2, { yaw: 0.6 });
      plush(bearM, 0.2, 0.16, -0.5);
      plush(bearS, -0.07, -0.24, 0.3);
      plush(dinoG, 0.27, -0.2, 2.6);
      plush(longcat, -0.18, -0.3, 0.1);
      break;
    case 'feet':
      // 長盒沿 z 平放，熊熊坐上去面向洞口（-x），雙腳伸出搭在擋板頂端
      box('long', -0.015, 0.13, { yaw: Math.PI / 2 });
      plush(bearM, -0.03, 0.13, Math.PI / 2, fy + 0.085 + 0.004);
      plush(dinoG, 0.08, 0.12, Math.PI);
      box('thin', 0.06, 0.25, { lie: 'flat', yaw: Math.PI / 2 });
      box('earbuds', 0.1, -0.05, { yaw: 0.3 });
      box('figure', -0.24, -0.08);
      plush(bearS, 0.22, -0.12, 0.4);
      plush(longcat, 0.05, -0.27, 0.0);
      break;
    case 'tailgroove':
      // 恐龍頭朝 +x，尾巴朝 -x 頂住 x = -0.11 擋板
      plush(dinoG, 0.06, 0.1, -Math.PI / 2);
      plush(dinoB, 0.06, 0.24, -Math.PI / 2);
      plush(bearS, -0.06, 0.17, -Math.PI / 2);
      box('blind', 0.2, 0.18);
      box('earbuds', 0.24, -0.05, { yaw: -0.2 });
      box('figure', -0.22, -0.07, { yaw: 0.1 });
      plush(bearM, 0.05, -0.2, 0.6);
      break;
    case 'empty':
      break;
    case 'single-box':
    default:
      box('figure', 0.05, 0.0);
      break;
  }
  return out;
}
