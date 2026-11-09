import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { BOX_SPECS, BoxArt, PlushSpec, PrizeInstance, spawnBox, spawnPlush } from './prizes';
import type { MachineProfile } from './profile';
import { GROUP_STATIC } from './groups';
import { Q4, V3, qEuler, qIdentity, rng, v3 } from './math';

type R = typeof RAPIER_NS;

/**
 * 擺台 Presets（Prize Arrangement）
 * 只決定「初始擺放」，結果完全交給物理；不設定任何成功機率。
 * 載入後會先讓物理運行到穩定，再交給玩家。
 * 新增的擺台依實拍照片整理（research/real-world-reference.md）。
 *
 * 洞口在左前角：x ∈ [-0.36, -0.11]，z ∈ [0.05, 0.30]
 * 擋板沿 x = -0.11 與 z = 0.05 兩條邊（含防甩片總高 0.18 m）。
 */
export interface LayoutInfo {
  id: string;
  name: string;
  desc: string;
  /** 食品類擺台：顯示「食品效期」貼紙 */
  food?: boolean;
  /** 台主用白板筆寫在玻璃上的字 */
  writing?: string[];
}
export const LAYOUTS: LayoutInfo[] = [
  { id: 'standard', name: '標準散鋪＋正門槍位', desc: '彩盒與布偶平鋪，洞口右側擺一個 3C 彩盒當槍位' },
  { id: 'snackstack', name: '零食疊疊樂（實拍）', desc: '粉紅泡棉墊高台上把零食盒疊成直排、背牆立一排；洞口旁疊一落當槍位；左側罐裝飲料', food: true, writing: ['新品上架', '槍位在這'] },
  { id: 'capsules', name: '扭蛋殼山（實拍）', desc: '大量透明扭蛋殼堆在檯面，會滾、會互相卡住', writing: ['超療癒', '低保'] },
  { id: 'pillows', name: '大頭抱枕排排站（實拍）', desc: '抱枕直立排成兩排，一個斜靠洞口擋板、一個平躺', writing: ['抱枕', '保夾中'] },
  { id: 'woodstand', name: '木架鐵盒（架子台）', desc: '綠色墊高台＋木製 V 型架托住大公仔盒，旁邊擺鐵盒' },
  { id: 'plushmountain', name: '布偶山', desc: '泡棉斜坡上堆滿布偶，往洞口方向傾斜' },
  { id: 'feet', name: '腳撐洞口（二樓）', desc: '熊熊坐在高台上，雙腳伸出擋板上方，背後用公仔盒頂住；重心仍在檯面內' },
  { id: 'tailgroove', name: '恐龍尾巴凹槽', desc: '兩隻恐龍尾巴貼著擋板形成凹槽，中間夾一隻圓熊' },
  { id: 'single-box', name: '單一硬盒（物理測試）', desc: '只有一個標準透明盒，用於夾取／滑脫測試' },
];

/** 擺台用的靜態道具（墊高台、木架、斜坡）：有碰撞體，也會被畫出來 */
export interface PropSpec {
  kind: 'riser' | 'wood' | 'wedge';
  center: V3;
  half: V3;
  rot: Q4;
  color: number;
}

export interface LayoutResult { prizes: PrizeInstance[]; props: PropSpec[] }

export function buildLayout(RAPIER: R, world: RAPIER_NS.World, prof: MachineProfile, id: string): LayoutResult {
  const fy = prof.cabinet.playFloorY;
  const out: PrizeInstance[] = [];
  const props: PropSpec[] = [];
  const prop = (p: PropSpec) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.center.x, p.center.y, p.center.z).setRotation(p.rot));
    const fr = p.kind === 'wood' ? 0.45 : 0.75; // 泡棉高摩擦、木頭中等（假設值）
    world.createCollider(RAPIER.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z).setFriction(fr).setRestitution(0.02).setCollisionGroups(GROUP_STATIC), body);
    props.push(p);
  };
  /** 墊高台：x0..x1、z0..z1、高 h（底在檯面） */
  const riser = (x0: number, x1: number, z0: number, z1: number, h: number, color = 0xffb6cf) =>
    prop({ kind: 'riser', center: v3((x0 + x1) / 2, fy + h / 2, (z0 + z1) / 2), half: v3((x1 - x0) / 2, h / 2, (z1 - z0) / 2), rot: qIdentity(), color });

  const box = (art: BoxArt, x: number, z: number, opts: { yaw?: number; lie?: 'flat' | 'side' | 'stand'; y?: number; tilt?: number } = {}) => {
    const spec = BOX_SPECS[art];
    const lie = opts.lie ?? 'stand';
    // stand：H 朝上；flat：D 朝上（平躺）；side：W 朝上（側躺）
    const rx = lie === 'flat' ? Math.PI / 2 : 0;
    const rz = (lie === 'side' ? Math.PI / 2 : 0) + (opts.tilt ?? 0);
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
  const R0 = rng(20261110);

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

    case 'snackstack': {
      // 實拍：粉紅泡棉墊高台，背牆立一排、前面疊成直排；洞口旁一落當槍位；罐裝飲料在左側
      const top = fy + 0.08;
      riser(-0.08, 0.34, -0.34, -0.02, 0.08);
      for (const layer of [0, 1]) for (const x of [0.0, 0.14, 0.27]) box('snack', x, -0.318, { y: top + layer * 0.192 });
      for (const x of [0.02, 0.18]) for (let i = 0; i < 6; i++) box('snack', x, -0.15, { lie: 'flat', y: top + i * 0.036 });
      for (let i = 0; i < 5; i++) box('snack', -0.03, 0.16, { lie: 'flat', y: fy + i * 0.036 });
      for (const z of [-0.08, -0.01]) for (const x of [-0.31, -0.24, -0.17]) box('can', x, z);
      box('snack', 0.2, 0.15, { lie: 'flat', yaw: 0.3 });
      break;
    }

    case 'capsules': {
      // 實拍：透明扭蛋殼堆成一片；兩層交錯
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) box('capsule', -0.06 + i * 0.09 + (R0() - 0.5) * 0.01, -0.3 + j * 0.09 + (R0() - 0.5) * 0.01);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) box('capsule', -0.015 + i * 0.09, -0.255 + j * 0.09, { y: fy + 0.075 });
      break;
    }

    case 'pillows':
      // 實拍：大頭抱枕直立排排站，一個斜靠洞口、一個躺著
      for (const x of [-0.25, -0.03, 0.19]) box('pillow', x, -0.3);
      for (const x of [0.05, 0.25]) box('pillow', x, -0.1, { yaw: 0.08 });
      box('pillow', -0.05, 0.17, { yaw: Math.PI / 2, tilt: 0.0 });
      box('pillow', 0.18, 0.15, { lie: 'flat', yaw: 0.2 });
      plush(bearS, -0.25, -0.1, 0.2);
      break;

    case 'woodstand': {
      // 實拍：漆成綠色的墊高台＋木製 V 型架；大公仔盒架在 V 上，旁邊鐵盒
      const h = 0.05, top = fy + h;
      riser(-0.1, 0.34, -0.34, 0.28, h, 0x9be3a0);
      // V 型架（沿 z 方向延伸），開口朝上；兩片木板各向內傾 0.55 rad
      const vx = 0.0, vz = 0.15, a = 0.55, Lp = 0.07, t = 0.006;
      for (const s of [-1, 1]) {
        prop({ kind: 'wood', center: v3(vx + s * 0.042, top + Lp * Math.cos(a), vz), half: v3(t, Lp, 0.05), rot: qEuler(0, 0, -s * a), color: 0xc89b62 });
      }
      box('bigfig', vx, vz, { lie: 'side', y: top + 0.05, yaw: Math.PI / 2 });
      box('tin', 0.16, -0.05, { yaw: 0.2, y: top });
      box('tin', 0.25, 0.16, { yaw: -0.3, y: top });
      box('bigfig', 0.2, -0.26, { y: top });
      for (let i = 0; i < 3; i++) box('snack', 0.0, -0.2, { lie: 'flat', y: top + i * 0.036 });
      break;
    }

    case 'plushmountain': {
      // 布偶山：泡棉斜坡（後高前低）上堆滿布偶
      const ang = 0.3, halfZ = 0.2, th = 0.02;
      prop({ kind: 'wedge', center: v3(0.12, fy + halfZ * Math.sin(ang) + th, -0.14), half: v3(0.22, th, halfZ), rot: qEuler(ang, 0, 0), color: 0xffd1e0 });
      const list = [bearM, bearS, dinoG, bearS, dinoB, bearM, bearS, longcat] as const;
      const cells: [number, number][] = [[-0.02, -0.25], [0.15, -0.27], [0.27, -0.2], [0.0, -0.08], [0.17, -0.1], [0.28, 0.02], [-0.03, 0.12], [0.15, 0.12]];
      list.forEach((sp, i) => plush(sp, cells[i][0], cells[i][1], R0() * 6.28, fy + 0.16 + (i % 3) * 0.05));
      break;
    }

    case 'feet':
      // 熊熊坐在高台（略高於擋板＋防甩片）上，面向洞口，雙腳伸出擋板外
      // 背後用大公仔盒頂住（PTT 案例：重量其實由後方物品支撐）
      riser(-0.105, 0.22, 0.06, 0.28, 0.185);
      plush(bearM, -0.05, 0.17, Math.PI / 2, fy + 0.185 + 0.004);
      box('bigfig', 0.058, 0.17, { yaw: Math.PI / 2, y: fy + 0.185 });
      plush(dinoG, 0.2, -0.05, Math.PI);
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
  return { prizes: out, props };
}
