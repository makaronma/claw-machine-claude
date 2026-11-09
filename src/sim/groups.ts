// 碰撞群組：membership << 16 | filter
// 測試規則：(A.member & B.filter) && (B.member & A.filter)
export const G_STATIC = 0x0001;
export const G_PRIZE = 0x0002; // 硬盒
export const G_HEAD = 0x0004;
export const G_LEG = 0x0008;
export const G_INTERNAL = 0x0010;
export const G_SENSOR = 0x0020;
// 布偶：每隻一個位元（bit 8~15 循環），同一隻布偶的部件互不碰撞
export const G_PLUSH_ALL = 0xff00;

const ig = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const GROUP_STATIC = ig(G_STATIC, G_PRIZE | G_HEAD | G_LEG | G_PLUSH_ALL);
export const GROUP_PRIZE = ig(G_PRIZE, G_STATIC | G_PRIZE | G_HEAD | G_LEG | G_SENSOR | G_PLUSH_ALL);
export const GROUP_HEAD = ig(G_HEAD, G_STATIC | G_PRIZE | G_PLUSH_ALL);
export const GROUP_LEG = ig(G_LEG, G_STATIC | G_PRIZE | G_PLUSH_ALL);
export const GROUP_INTERNAL = ig(G_INTERNAL, 0);
export const GROUP_SENSOR = ig(G_SENSOR, G_PRIZE | G_PLUSH_ALL);

let plushCounter = 0;
export function resetPlushBits() { plushCounter = 0; }
export function nextPlushGroup(): number {
  const bit = 1 << (8 + (plushCounter++ % 8));
  return ig(bit, (G_STATIC | G_PRIZE | G_HEAD | G_LEG | G_SENSOR | G_PLUSH_ALL) & ~bit);
}
