/**
 * 輸入：電腦 WASD／方向鍵＋Space；手機虛擬搖桿＋紅色按鈕。
 * 真實機台搖桿為微動開關（只有方向開／關），所以虛擬搖桿也量化成 8 方向數位訊號，
 * 推得再遠也不會比較快。
 * 座標：W／↑ = 往後（遠離玩家，-z），S／↓ = 往前（靠近玩家，+z）。
 */
export class InputState {
  dirX: -1 | 0 | 1 = 0;
  dirZ: -1 | 0 | 1 = 0;
  private keys = new Set<string>();
  private stickX: -1 | 0 | 1 = 0;
  private stickZ: -1 | 0 | 1 = 0;
  onDrop?: () => void;
  onKey?: (k: string) => void;

  constructor(joystickEl: HTMLElement, knobEl: HTMLElement, dropBtn: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea, .lil-gui')) return;
      const k = e.key.toLowerCase();
      if ([' ', 'enter'].includes(k)) { e.preventDefault(); if (!e.repeat) this.onDrop?.(); return; }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.keys.add(k);
      this.onKey?.(k);
      this.recompute();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); this.recompute(); });
    window.addEventListener('blur', () => { this.keys.clear(); this.recompute(); });

    // 虛擬搖桿
    let active: number | null = null;
    const R = 48;
    const update = (cx: number, cy: number) => {
      const r = joystickEl.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      if (d < 14) { this.stickX = 0; this.stickZ = 0; }
      else {
        // 8 方向量化
        const a = Math.atan2(dy, dx);
        const sector = Math.round(a / (Math.PI / 4));
        const dirs: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        const [sx, sz] = dirs[(sector + 8) % 8];
        this.stickX = sx as -1 | 0 | 1;
        this.stickZ = sz as -1 | 0 | 1;
      }
      this.recompute();
    };
    joystickEl.addEventListener('pointerdown', (e) => { active = e.pointerId; joystickEl.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); });
    joystickEl.addEventListener('pointermove', (e) => { if (active === e.pointerId) update(e.clientX, e.clientY); });
    const end = (e: PointerEvent) => {
      if (active !== e.pointerId) return;
      active = null;
      knobEl.style.transform = '';
      this.stickX = 0; this.stickZ = 0;
      this.recompute();
    };
    joystickEl.addEventListener('pointerup', end);
    joystickEl.addEventListener('pointercancel', end);
    dropBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onDrop?.(); });
  }

  private recompute() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    x += this.stickX; z += this.stickZ;
    this.dirX = Math.sign(x) as -1 | 0 | 1;
    this.dirZ = Math.sign(z) as -1 | 0 | 1;
  }
}
