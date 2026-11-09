// 輕量向量／四元數工具（模擬核心不依賴 three.js，才能在 Node 跑測試）
export interface V3 { x: number; y: number; z: number }
export interface Q4 { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : v3(0, 1, 0);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const qIdentity = (): Q4 => ({ x: 0, y: 0, z: 0, w: 1 });
export function qAxisAngle(axis: V3, angle: number): Q4 {
  const a = norm(axis);
  const s = Math.sin(angle / 2);
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(angle / 2) };
}
export function qMul(a: Q4, b: Q4): Q4 {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
export function qRotate(q: Q4, v: V3): V3 {
  // v' = q v q*
  const u = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}
/** 把 +Y 轉到 dir 的四元數（用來擺放 capsule） */
export function qFromYTo(dir: V3): Q4 {
  const d = norm(dir);
  const y = v3(0, 1, 0);
  const c = dot(y, d);
  if (c > 0.999999) return qIdentity();
  if (c < -0.999999) return qAxisAngle(v3(1, 0, 0), Math.PI);
  const axis = cross(y, d);
  return qAxisAngle(axis, Math.acos(clamp(c, -1, 1)));
}
export function qEuler(x: number, y: number, z: number): Q4 {
  return qMul(qMul(qAxisAngle(v3(0, 1, 0), y), qAxisAngle(v3(1, 0, 0), x)), qAxisAngle(v3(0, 0, 1), z));
}

/** 可重現的亂數（mulberry32），擺台與測試都要可重播 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由正交基底（三個欄向量）求四元數 */
export function qFromBasis(X: V3, Y: V3, Z: V3): Q4 {
  const m00 = X.x, m01 = Y.x, m02 = Z.x;
  const m10 = X.y, m11 = Y.y, m12 = Z.y;
  const m20 = X.z, m21 = Y.z, m22 = Z.z;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2; w = 0.25 * S; x = (m21 - m12) / S; y = (m02 - m20) / S; z = (m10 - m01) / S;
  } else if (m00 > m11 && m00 > m22) {
    const S = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / S; x = 0.25 * S; y = (m01 + m10) / S; z = (m02 + m20) / S;
  } else if (m11 > m22) {
    const S = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / S; x = (m01 + m10) / S; y = 0.25 * S; z = (m12 + m21) / S;
  } else {
    const S = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / S; x = (m02 + m20) / S; y = (m12 + m21) / S; z = 0.25 * S;
  }
  return { x, y, z, w };
}
