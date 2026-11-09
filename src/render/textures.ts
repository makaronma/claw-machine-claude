import * as THREE from 'three';
import type { BoxArt } from '../sim/prizes';

/** 全部用 Canvas 程式繪製，不使用外部素材；品牌與角色皆為自創。 */
const FONT = `'PingFang TC','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif`;

// 相同參數的貼圖只畫一次
const texCache = new Map<string, THREE.Texture>();
function memo<A extends unknown[]>(name: string, fn: (...a: A) => THREE.Texture) {
  return (...a: A) => {
    const k = name + JSON.stringify(a);
    let t = texCache.get(k);
    if (!t) { t = fn(...a); texCache.set(k, t); }
    return t;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** 店面地磚：30 cm 白灰磁磚 */
export function tileFloorTexture() {
  const t = canvasTex(512, 512, (g, w, h) => {
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 226 + ((i * 7 + j * 13) % 5) * 3;
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(i * s, j * s, s, s);
      // 細微斑點
      for (let k = 0; k < 120; k++) {
        g.fillStyle = `rgba(120,120,110,${Math.random() * 0.08})`;
        g.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
      }
    }
    g.strokeStyle = '#b9b7b0';
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 機台燈箱招牌 */
export const lightboxTexture = memo('lightboxTexture', function lightboxTexture(title: string, sub: string, hue: string) {
  return canvasTex(1024, 360, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, hue);
    grad.addColorStop(1, '#ffd84d');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 放射條紋
    g.save();
    g.translate(w / 2, h * 1.1);
    for (let i = 0; i < 24; i++) {
      g.rotate((Math.PI * 2) / 24);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0)';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-90, -900); g.lineTo(90, -900); g.closePath(); g.fill();
    }
    g.restore();
    g.font = `900 150px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 18;
    g.strokeStyle = '#7a1442';
    g.strokeText(title, w / 2, h * 0.43);
    g.fillStyle = '#ffffff';
    g.fillText(title, w / 2, h * 0.43);
    g.font = `700 44px ${FONT}`;
    g.fillStyle = '#7a1442';
    g.fillText(sub, w / 2, h * 0.82);
  });
});

/** 機台內背板圖樣 */
export const backdropTexture = memo('backdropTexture', function backdropTexture(hue: string) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = hue;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < w; x += 64) {
      g.beginPath(); g.arc(x + 16, y + 16, 12, 0, Math.PI * 2); g.fill();
    }
    g.font = `800 40px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.textAlign = 'center';
    g.fillText('夾到就是你的', w / 2, h * 0.55);
  });
});

/** 前方玻璃上的告示貼紙（台灣機台常見的保證取物標示） */
export const glassStickerTexture = memo('glassStickerTexture', function glassStickerTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    roundRect(g, 6, 6, w - 12, h - 12, 26);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fill();
    g.lineWidth = 8; g.strokeStyle = '#e4324c'; g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#e4324c';
    g.font = `900 64px ${FONT}`;
    g.fillText('保證取物', w / 2, 92);
    g.fillStyle = '#222';
    g.font = `700 40px ${FONT}`;
    g.fillText('本機免費・無限次遊玩', w / 2, 160);
    g.font = `500 28px ${FONT}`;
    g.fillStyle = '#555';
    g.fillText('物理研究基準機 DL-G2-BASE', w / 2, 212);
  });
});

/** 控制面板面貼 */
export const panelTexture = memo('panelTexture', function panelTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2b2b33'); grad.addColorStop(1, '#17171c');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff4f7a';
    g.font = `800 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('移動', w * 0.27, h * 0.9);
    g.fillText('下爪', w * 0.73, h * 0.9);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 3;
    g.strokeRect(10, 10, w - 20, h - 20);
  });
});

export const lcdTexture = memo('lcdTexture', function lcdTexture(text: string) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#061a0c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#39ff7a';
    g.font = `700 46px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
});

// ------------------------------------------------------------------ prize art
interface ArtStyle { bg: string; bg2: string; ink: string; brand: string; product: string; tagline: string; icon: 'earbuds' | 'fan' | 'gift' | 'tool' | 'mystery' | 'figure' }
const ART: Record<BoxArt, ArtStyle> = {
  earbuds: { bg: '#0d2b55', bg2: '#1f6fd1', ink: '#ffffff', brand: 'SOUNDiO 聲悅', product: '真無線藍牙耳機', tagline: '藍牙5.3｜降噪｜長續航', icon: 'earbuds' },
  fan: { bg: '#e8f7ff', bg2: '#7fd0f5', ink: '#0b3d5c', brand: '涼夏 COOLY', product: 'USB 手持風扇', tagline: '三段風速｜靜音｜可充電', icon: 'fan' },
  thin: { bg: '#fff1d6', bg2: '#ff9f5a', ink: '#5a2400', brand: 'HAPPY HOME', product: '多功能收納組', tagline: '居家好物 超值入手', icon: 'gift' },
  long: { bg: '#1d1d1f', bg2: '#d62f2f', ink: '#ffffff', brand: 'PROTOOL 職人', product: '精密工具組 24件', tagline: '鉻釩鋼｜附收納盒', icon: 'tool' },
  blind: { bg: '#ffe0f0', bg2: '#b17cff', ink: '#3a0a4f', brand: 'POPMOO', product: '驚喜盲盒', tagline: '隨機款 共12種', icon: 'mystery' },
  figure: { bg: '#fdfdfd', bg2: '#ffd2e0', ink: '#a0174a', brand: 'MOCHI STAR', product: '精緻公仔', tagline: 'Collection Figure', icon: 'figure' },
  snack: { bg: '#d7263d', bg2: '#ff6f61', ink: '#ffffff', brand: 'PUFFY COCO', product: '可可脆片', tagline: '草莓／牛奶 雙口味', icon: 'gift' },
  tin: { bg: '#1f3b2d', bg2: '#e0a526', ink: '#fff6d8', brand: 'GOLDEN TIN', product: '限定印花鐵盒', tagline: '收藏款', icon: 'mystery' },
  bigfig: { bg: '#2b2350', bg2: '#ff7ab6', ink: '#ffffff', brand: 'STAR PRIZE', product: '景品公仔', tagline: '約 22cm 大尺寸', icon: 'figure' },
  can: { bg: '#3ec1d3', bg2: '#ffffff', ink: '#06303a', brand: 'FIZZ', product: '氣泡飲', tagline: '330ml', icon: 'gift' },
  capsule: { bg: '#ffffff', bg2: '#ffffff', ink: '#333333', brand: '', product: '', tagline: '', icon: 'gift' },
  pillow: { bg: '#ffe9c9', bg2: '#ffd09a', ink: '#5a3a14', brand: '', product: '', tagline: '', icon: 'gift' },
};

function drawIcon(g: CanvasRenderingContext2D, icon: ArtStyle['icon'], cx: number, cy: number, s: number, ink: string) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#ffffff';
  g.strokeStyle = ink;
  g.lineWidth = s * 0.04;
  switch (icon) {
    case 'earbuds':
      for (const sx of [-1, 1]) {
        g.beginPath(); g.ellipse(sx * s * 0.22, 0, s * 0.16, s * 0.2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillRect(sx * s * 0.22 - s * 0.04, s * 0.1, s * 0.08, s * 0.32);
      }
      break;
    case 'fan':
      g.beginPath(); g.arc(0, -s * 0.12, s * 0.3, 0, Math.PI * 2); g.fill(); g.stroke();
      for (let i = 0; i < 5; i++) {
        g.save(); g.translate(0, -s * 0.12); g.rotate((i * Math.PI * 2) / 5);
        g.fillStyle = ink; g.beginPath(); g.ellipse(0, -s * 0.14, s * 0.06, s * 0.12, 0.3, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.fillStyle = '#ffffff'; g.fillRect(-s * 0.06, s * 0.18, s * 0.12, s * 0.32); g.strokeRect(-s * 0.06, s * 0.18, s * 0.12, s * 0.32);
      break;
    case 'gift':
      g.fillRect(-s * 0.3, -s * 0.15, s * 0.6, s * 0.45); g.strokeRect(-s * 0.3, -s * 0.15, s * 0.6, s * 0.45);
      g.fillStyle = ink; g.fillRect(-s * 0.04, -s * 0.15, s * 0.08, s * 0.45);
      break;
    case 'tool':
      g.rotate(-0.6);
      g.fillRect(-s * 0.05, -s * 0.4, s * 0.1, s * 0.8); g.strokeRect(-s * 0.05, -s * 0.4, s * 0.1, s * 0.8);
      g.beginPath(); g.arc(0, -s * 0.42, s * 0.14, 0, Math.PI * 2); g.fill(); g.stroke();
      break;
    case 'mystery':
      g.font = `900 ${s * 0.8}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.fillText('?', 0, 0); g.strokeText('?', 0, 0);
      break;
    case 'figure':
      g.beginPath(); g.arc(0, -s * 0.12, s * 0.24, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = ink; g.beginPath(); g.arc(-s * 0.08, -s * 0.12, s * 0.03, 0, Math.PI * 2); g.arc(s * 0.08, -s * 0.12, s * 0.03, 0, Math.PI * 2); g.fill();
      break;
  }
  g.restore();
}

/** 彩盒正面（台灣 3C 景品盒常見排版：品牌、品名、商品圖、賣點 icon 列） */
export const boxFrontTexture = memo('boxFrontTexture', function boxFrontTexture(art: BoxArt, aspect: number) {
  const st = ART[art];
  const W = 512, H = Math.round(512 / Math.max(0.3, Math.min(3, aspect)));
  return canvasTex(W, Math.min(1024, Math.max(160, H)), (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, st.bg); grad.addColorStop(1, st.bg2);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const s = Math.min(w, h);
    g.fillStyle = st.ink;
    g.textAlign = 'center';
    g.font = `800 ${s * 0.09}px ${FONT}`;
    g.fillText(st.brand, w / 2, h * 0.12 + s * 0.05);
    if (art !== 'figure') drawIcon(g, st.icon, w / 2, h * 0.48, s * 0.55, st.ink);
    g.font = `900 ${s * 0.1}px ${FONT}`;
    g.fillStyle = st.ink;
    g.fillText(st.product, w / 2, h * 0.8);
    g.font = `600 ${s * 0.055}px ${FONT}`;
    g.globalAlpha = 0.85;
    g.fillText(st.tagline, w / 2, h * 0.8 + s * 0.1);
    g.globalAlpha = 1;
    // 角落標籤
    g.fillStyle = '#ffd400';
    g.beginPath(); g.arc(w * 0.86, h * 0.1 + s * 0.06, s * 0.08, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c00';
    g.font = `900 ${s * 0.05}px ${FONT}`;
    g.fillText('NEW', w * 0.86, h * 0.1 + s * 0.08);
  });
});

export const boxSideTexture = memo('boxSideTexture', function boxSideTexture(art: BoxArt) {
  const st = ART[art];
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = st.bg2; g.fillRect(0, 0, w, h);
    g.fillStyle = st.ink;
    g.globalAlpha = 0.9;
    g.font = `700 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(st.brand, w / 2, h * 0.45);
    g.font = `500 18px ${FONT}`;
    g.fillText('台灣總代理｜品質保證', w / 2, h * 0.62);
    // 條碼
    g.fillStyle = '#fff'; g.fillRect(w * 0.25, h * 0.72, w * 0.5, h * 0.18);
    g.fillStyle = '#000';
    for (let x = w * 0.27; x < w * 0.73; x += 4 + ((x * 7) % 3)) g.fillRect(x, h * 0.74, (x % 3) + 1, h * 0.12);
  });
});

/** 布料：細絨毛雜訊（用作 roughness/bump） */
export function fabricBumpTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** 店內牆面海報 */
export const posterTexture = memo('posterTexture', function posterTexture(title: string, lines: string[], color: string) {
  return canvasTex(512, 720, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(title, w / 2, 130);
    g.font = `600 36px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, w / 2, 240 + i * 64));
  });
});

/** 罐身標籤（圓柱展開） */
export const canLabelTexture = memo('canLabelTexture', function canLabelTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3ec1d3'); grad.addColorStop(1, '#1d7f9a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff'; g.font = `900 92px ${FONT}`; g.textAlign = 'center'; g.fillText('FIZZ', w * 0.3, h * 0.6); g.fillText('FIZZ', w * 0.8, h * 0.6);
    g.font = `700 30px ${FONT}`; g.fillText('氣泡飲 330ml', w * 0.3, h * 0.85); g.fillText('氣泡飲 330ml', w * 0.8, h * 0.85);
  });
});

/** 抱枕臉（原創貓臉） */
export const pillowFaceTexture = memo('pillowFaceTexture', function pillowFaceTexture(variant: number) {
  const palettes = [['#ffe9c9', '#f29b38'], ['#e8f1ff', '#7aa7e8'], ['#ffe3ee', '#f07aa5']];
  const [bg, ac] = palettes[variant % palettes.length];
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = ac;
    g.beginPath(); g.moveTo(30, 70); g.lineTo(60, 10); g.lineTo(95, 55); g.fill();
    g.beginPath(); g.moveTo(226, 70); g.lineTo(196, 10); g.lineTo(161, 55); g.fill();
    g.fillStyle = '#2a1d10';
    for (const x of [88, 168]) { g.beginPath(); g.ellipse(x, 120, 14, 20, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff'; for (const x of [93, 173]) { g.beginPath(); g.arc(x, 112, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ff8fa3'; for (const x of [60, 196]) { g.beginPath(); g.ellipse(x, 160, 18, 10, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#2a1d10'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(112, 160); g.quadraticCurveTo(128, 175, 128, 160); g.quadraticCurveTo(128, 175, 144, 160); g.stroke();
  });
});

/** 全像亮片背板（台灣機台常見的彩虹雷射亮片紙） */
export const holoTexture = memo('holoTexture', function holoTexture() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8f95a8'; g.fillRect(0, 0, w, h);
    const hues = [0, 40, 60, 120, 180, 220, 280, 320];
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const hue = hues[(Math.floor(x / 40) + Math.floor(y / 60)) % hues.length] + Math.random() * 30;
      g.fillStyle = Math.random() < 0.55 ? `hsla(${hue},95%,${55 + Math.random() * 25}%,0.95)` : `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
      const s = 1 + Math.random() * 3;
      g.fillRect(x, y, s, s);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
});

/** 保證取物價格盒（LED 顯示即時累計金額） */
export function guaranteeSignTexture(price: number, credits: number, active: boolean, enabled: boolean) {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7a5a00'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#3a2a00'; g.textAlign = 'center';
    g.font = `900 64px ${FONT}`; g.fillText(enabled ? '保證取物' : '無保夾', w / 2, 76);
    g.font = `900 92px ${FONT}`; g.fillText(enabled ? `${price} 元` : '—', w / 2, 170);
    g.fillStyle = '#111'; g.fillRect(40, 196, w - 80, 100);
    g.fillStyle = active ? '#ff3b3b' : '#39ff7a';
    g.font = `700 54px ui-monospace, Menlo, monospace`;
    g.fillText(active ? '保夾中！' : `累計 ${String(credits).padStart(3, ' ')}`, w / 2, 266);
  });
}

/** 一般貼紙（白底紅框） */
export const stickerTexture = memo('stickerTexture', function stickerTexture(lines: string[], color: string) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = color; g.textAlign = 'center';
    const longest = Math.max(...lines.map((l) => l.length));
    g.font = `900 ${Math.min(lines.length > 1 ? 78 : 96, Math.floor((w - 50) / longest))}px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1) + 28));
  });
});

/** 台主用白板筆寫在玻璃上的字（透明底） */
export const glassWritingTexture = memo('glassWritingTexture', function glassWritingTexture(lines: string[], color: string) {
  return canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.textAlign = 'left';
    g.font = `700 64px 'Bradley Hand', 'Comic Sans MS', ${FONT}`;
    lines.forEach((l, i) => { g.save(); g.translate(20, 80 + i * 80); g.rotate(-0.04 + i * 0.03); g.fillText(l, 0, 0); g.restore(); });
  });
});
