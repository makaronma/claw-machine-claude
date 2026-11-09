import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 把靜態物件依「材質＋物件型別＋陰影設定」合併成少數幾個 Mesh，降低 draw call。
 * 有名字（keep 清單）的物件保留不合併（例如會動的搖桿與按鈕）。
 */
export function mergeStatic(root: THREE.Object3D, keep: string[] = []): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const buckets = new Map<string, { mat: THREE.Material; kind: 'mesh' | 'line'; cast: boolean; recv: boolean; order: number; geos: THREE.BufferGeometry[] }>();
  const kept: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (keep.includes(o.name)) { kept.push(o); return; }
    if (kept.some((k) => isDescendant(o, k))) return;
    const isMesh = (o as THREE.Mesh).isMesh, isLine = (o as THREE.LineSegments).isLineSegments;
    if (!isMesh && !isLine) return;
    const m = o as THREE.Mesh;
    if (Array.isArray(m.material)) { kept.push(o); return; }
    let g = m.geometry.clone().applyMatrix4(o.matrixWorld);
    // 合併需要一致的 index 與屬性
    if (isMesh) { if (!g.index) g = toIndexed(g); for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name); }
    else if (g.index) g = g.toNonIndexed();
    const key = `${m.material.uuid}|${isMesh ? 'm' : 'l'}|${m.castShadow}|${m.receiveShadow}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) { b = { mat: m.material, kind: isMesh ? 'mesh' : 'line', cast: m.castShadow, recv: m.receiveShadow, order: o.renderOrder, geos: [] }; buckets.set(key, b); }
    b.geos.push(g);
  });
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const obj = b.kind === 'mesh' ? new THREE.Mesh(merged, b.mat) : new THREE.LineSegments(merged, b.mat);
    obj.castShadow = b.cast;
    obj.receiveShadow = b.recv;
    obj.renderOrder = b.order;
    obj.matrixAutoUpdate = false;
    out.add(obj);
    b.geos.forEach((g) => g.dispose());
  }
  // 保留的物件：搬到新群組並保持世界座標
  for (const k of kept) {
    const wm = k.matrixWorld.clone();
    k.removeFromParent();
    wm.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}

function isDescendant(o: THREE.Object3D, ancestor: THREE.Object3D) {
  for (let p = o.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

function toIndexed(g: THREE.BufferGeometry) {
  const n = g.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
