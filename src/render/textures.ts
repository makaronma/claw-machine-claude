import * as THREE from 'three';
import type { BoxArt } from '../sim/prizes';

/** 全部用 Canvas 程式繪製，不使用外部素材；品牌與角色皆為自創。 */
const FONT = `'PingFang TC','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif`;

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
export function lightboxTexture(title: string, sub: string, hue: string) {
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
}

/** 機台內背板圖樣 */
export function backdropTexture(hue: string) {
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
}

/** 前方玻璃上的告示貼紙（台灣機台常見的保證取物標示） */
export function glassStickerTexture() {
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
}

/** 控制面板面貼 */
export function panelTexture() {
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
}

export function lcdTexture(text: string) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#061a0c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#39ff7a';
    g.font = `700 46px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// ------------------------------------------------------------------ prize art
interface ArtStyle { bg: string; bg2: string; ink: string; brand: string; product: string; tagline: string; icon: 'earbuds' | 'fan' | 'gift' | 'tool' | 'mystery' | 'figure' }
const ART: Record<BoxArt, ArtStyle> = {
  earbuds: { bg: '#0d2b55', bg2: '#1f6fd1', ink: '#ffffff', brand: 'SOUNDiO 聲悅', product: '真無線藍牙耳機', tagline: '藍牙5.3｜降噪｜長續航', icon: 'earbuds' },
  fan: { bg: '#e8f7ff', bg2: '#7fd0f5', ink: '#0b3d5c', brand: '涼夏 COOLY', product: 'USB 手持風扇', tagline: '三段風速｜靜音｜可充電', icon: 'fan' },
  thin: { bg: '#fff1d6', bg2: '#ff9f5a', ink: '#5a2400', brand: 'HAPPY HOME', product: '多功能收納組', tagline: '居家好物 超值入手', icon: 'gift' },
  long: { bg: '#1d1d1f', bg2: '#d62f2f', ink: '#ffffff', brand: 'PROTOOL 職人', product: '精密工具組 24件', tagline: '鉻釩鋼｜附收納盒', icon: 'tool' },
  blind: { bg: '#ffe0f0', bg2: '#b17cff', ink: '#3a0a4f', brand: 'POPMOO', product: '驚喜盲盒', tagline: '隨機款 共12種', icon: 'mystery' },
  figure: { bg: '#fdfdfd', bg2: '#ffd2e0', ink: '#a0174a', brand: 'MOCHI STAR', product: '精緻公仔', tagline: 'Collection Figure', icon: 'figure' },
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
export function boxFrontTexture(art: BoxArt, aspect: number) {
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
}

export function boxSideTexture(art: BoxArt) {
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
}

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
export function posterTexture(title: string, lines: string[], color: string) {
  return canvasTex(512, 720, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(title, w / 2, 130);
    g.font = `600 36px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, w / 2, 240 + i * 64));
  });
}
