// 各国の君主を一目で見分けられるように、国ごとに特徴的な2Dアイコン(canvas描画)を生成する。
// 写実的な一枚絵ではなく、既存のユニットchibi絵と同系統のデフォルメ塗り分けスタイル。

const PORTRAIT_SIZE = 128;
const portraitCache = new Map();

// 国ID -> 描画パラメータ(肌・髪型・アクセサリ・表情・背景色などを個別に指定して差別化する)
const PORTRAIT_DEFS = {
  reimei: { bg: ['#bfe0ff', '#7fb8ff'], skin: '#ffe0c2', hair: '#3a3550', hairStyle: 'short', accessory: 'cape', accentColor: '#3d7fd6', eyes: 'determined' },
  haitetsu: { bg: ['#cfc8b8', '#8b7d6b'], skin: '#e8c9a0', hair: '#5a5040', hairStyle: 'messy', accessory: 'eyepatch', accentColor: '#8b7d6b', eyes: 'sly' },
  haga: { bg: ['#f0c98a', '#d9a441'], skin: '#c98456', hair: '#5a3a1a', hairStyle: 'mohawk', accessory: 'tusks', accentColor: '#d9a441', eyes: 'fierce' },
  shinkyu: { bg: ['#f5ecd6', '#e0c589'], skin: '#ffe6cc', hair: '#e8d8a0', hairStyle: 'long', accessory: 'bow', accentColor: '#e0c589', eyes: 'calm' },
  kyogan: { bg: ['#d6d0c4', '#a79a8a'], skin: '#d8b896', hair: '#4a4238', hairStyle: 'bald', accessory: 'helmet', accentColor: '#a79a8a', eyes: 'stern' },
  inrou: { bg: ['#8fa88f', '#5b6b5b'], skin: '#e0c2a0', hair: '#2a2a2a', hairStyle: 'hood', accessory: 'wolfear', accentColor: '#5b6b5b', eyes: 'narrow' },
  ryusen: { bg: ['#9ab6e0', '#4f6fae'], skin: '#ffe0c8', hair: '#1f3a6e', hairStyle: 'ponytail', accessory: 'scale', accentColor: '#4f6fae', eyes: 'sharp' },
  fuin: { bg: ['#b6a8d6', '#5a4f6e'], skin: '#e8d8e0', hair: '#2a1f3a', hairStyle: 'veil', accessory: 'seal', accentColor: '#5a4f6e', eyes: 'closed' },
  rekka: { bg: ['#ffb0a0', '#d64545'], skin: '#ffdcc2', hair: '#d64545', hairStyle: 'spiky', accessory: 'flame', accentColor: '#d64545', eyes: 'fierce' },
  soukai: { bg: ['#7fc8dc', '#3d8fae'], skin: '#e0c8b0', hair: '#1a3d4a', hairStyle: 'wave', accessory: 'mask', accentColor: '#3d8fae', eyes: 'narrow' },
  // プレイヤーが選べる大将・副将キャラクター
  noa: { bg: ['#bfe0ff', '#7fb8ff'], skin: '#ffe0c2', hair: '#3a3550', hairStyle: 'short', accessory: 'cape', accentColor: '#3d7fd6', eyes: 'determined' },
  rio: { bg: ['#cdeccb', '#7fd18a'], skin: '#ffe6cc', hair: '#3a5a2a', hairStyle: 'ponytail', accessory: 'bow', accentColor: '#4f9e3f', eyes: 'sharp' },
  gai: { bg: ['#ffe0b0', '#ff9a5c'], skin: '#e0a878', hair: '#a83214', hairStyle: 'spiky', accessory: 'plume', accentColor: '#a83214', eyes: 'fierce' },
  sera: { bg: ['#e8e0f0', '#b6a8d6'], skin: '#ffe0c8', hair: '#e8d8a0', hairStyle: 'long', accessory: 'shield', accentColor: '#5a4f8e', eyes: 'calm' },
};

function drawHair(ctx, style, color, cx, cy, r) {
  ctx.fillStyle = color;
  switch (style) {
    case 'short':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 1.05, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 'messy':
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.28, cy - r * 0.75);
        ctx.lineTo(cx + i * r * 0.28 + r * 0.12, cy - r * 1.25 + Math.abs(i) * 4);
        ctx.lineTo(cx + i * r * 0.28 + r * 0.26, cy - r * 0.7);
        ctx.fill();
      }
      break;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.18, cy - r * 0.7);
      ctx.lineTo(cx, cy - r * 1.55);
      ctx.lineTo(cx + r * 0.18, cy - r * 0.7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.02, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.2, r * 1.05, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.9, cy + r * 0.5, r * 0.28, r * 0.9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 0.9, cy + r * 0.5, r * 0.28, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bald':
      break;
    case 'hood':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.05, r * 1.25, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      break;
    case 'ponytail':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 1.05, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 1.05, cy + r * 0.3, r * 0.24, r * 0.75, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'veil':
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.1, r * 1.3, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'spiky':
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.25, cy - r * 0.7);
        ctx.lineTo(cx + i * r * 0.25, cy - r * 1.5 - Math.abs(i) * 6);
        ctx.lineTo(cx + i * r * 0.25 + r * 0.2, cy - r * 0.65);
        ctx.fill();
      }
      break;
    case 'wave':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.1, r * 1.08, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function drawAccessory(ctx, type, color, cx, cy, r) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (type) {
    case 'cape':
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.15, cy + r * 1.5);
      ctx.lineTo(cx - r * 0.6, cy + r * 0.3);
      ctx.lineTo(cx + r * 0.6, cy + r * 0.3);
      ctx.lineTo(cx + r * 1.15, cy + r * 1.5);
      ctx.fill();
      break;
    case 'eyepatch':
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.32, cy - r * 0.05, r * 0.24, r * 0.18, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.6, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.75, cy + r * 0.1);
      ctx.stroke();
      break;
    case 'tusks':
      ctx.fillStyle = '#fff8ec';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy + r * 0.35);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.18, cy + r * 0.42);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.3, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.45, cy + r * 0.75);
      ctx.lineTo(cx + r * 0.18, cy + r * 0.42);
      ctx.fill();
      break;
    case 'bow':
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx + r * 1.15, cy, r * 0.95, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 1.12, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillRect(cx - r * 0.06, cy - r * 1.0, r * 0.12, r * 0.4);
      break;
    case 'wolfear':
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy - r * 0.7);
      ctx.lineTo(cx - r * 0.75, cy - r * 1.25);
      ctx.lineTo(cx - r * 0.3, cy - r * 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.55, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.75, cy - r * 1.25);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.85);
      ctx.fill();
      break;
    case 'scale':
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx - r * 0.7 + i * r * 0.28, cy - r * 0.95, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    case 'seal':
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 1.05, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy - r * 1.05);
      ctx.lineTo(cx + r * 0.12, cy - r * 1.05);
      ctx.moveTo(cx, cy - r * 1.17);
      ctx.lineTo(cx, cy - r * 0.93);
      ctx.stroke();
      break;
    case 'flame':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.5);
      ctx.quadraticCurveTo(cx + r * 0.35, cy - r * 1.1, cx + r * 0.12, cy - r * 0.75);
      ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.7, cx, cy - r * 0.5);
      ctx.quadraticCurveTo(cx - r * 0.3, cy - r * 0.7, cx - r * 0.12, cy - r * 0.75);
      ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 1.1, cx, cy - r * 1.5);
      ctx.fill();
      break;
    case 'mask':
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.05, r * 0.62, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'plume':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.75);
      ctx.quadraticCurveTo(cx + r * 0.45, cy - r * 1.35, cx + r * 0.15, cy - r * 1.7);
      ctx.quadraticCurveTo(cx + r * 0.35, cy - r * 1.25, cx, cy - r * 0.75);
      ctx.fill();
      break;
    case 'shield':
      ctx.fillStyle = '#f0f0f0';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.85, cy - r * 0.1);
      ctx.lineTo(cx + r * 1.25, cy - r * 0.02);
      ctx.lineTo(cx + r * 1.2, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.85, cy + r * 0.75);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
}

function drawEyes(ctx, style, cx, cy, r) {
  ctx.fillStyle = '#2a2438';
  const ey = cy - r * 0.05;
  const dx = r * 0.32;
  switch (style) {
    case 'closed':
      ctx.strokeStyle = '#2a2438';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx - dx - r * 0.12, ey);
      ctx.lineTo(cx - dx + r * 0.12, ey);
      ctx.moveTo(cx + dx - r * 0.12, ey);
      ctx.lineTo(cx + dx + r * 0.12, ey);
      ctx.stroke();
      break;
    case 'narrow':
      ctx.beginPath();
      ctx.ellipse(cx - dx, ey, r * 0.1, r * 0.04, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + dx, ey, r * 0.1, r * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sly':
      ctx.beginPath();
      ctx.ellipse(cx - dx, ey, r * 0.09, r * 0.06, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx - dx, ey, r * 0.08, 0, Math.PI * 2);
      ctx.arc(cx + dx, ey, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawPortrait(ctx, def) {
  const size = PORTRAIT_SIZE;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size * 0.3;

  const bgGrad = ctx.createRadialGradient(cx, cy - 10, 6, cx, cy, size * 0.72);
  bgGrad.addColorStop(0, def.bg[0]);
  bgGrad.addColorStop(1, def.bg[1]);
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
  ctx.fill();

  if (def.accessory === 'cape') drawAccessory(ctx, 'cape', def.accentColor, cx, cy, r);

  // 首・肩
  ctx.fillStyle = def.skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.95, r * 0.7, r * 0.55, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // 顔
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, def.hairStyle, def.hair, cx, cy, r);
  drawEyes(ctx, def.eyes, cx, cy, r);
  if (def.accessory !== 'cape') drawAccessory(ctx, def.accessory, def.accentColor, cx, cy, r);

  // 縁取り
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.62 - 2, 0, Math.PI * 2);
  ctx.stroke();
}

// 武将ガチャの拡張ロースター(副将・一般武将)用: 手描き定義が無いIDでも、
// 所属国(IDの先頭部分)の配色を引き継ぎつつ、髪型・アクセサリ・表情だけをID固定のハッシュで
// 変化させた肖像画を自動生成する(46人分すべてに手描き定義を用意しなくても破綻しないようにする)
const HAIR_STYLES = ['short', 'messy', 'mohawk', 'long', 'bald', 'hood', 'ponytail', 'veil', 'spiky', 'wave'];
const ACCESSORIES = ['cape', 'eyepatch', 'tusks', 'bow', 'helmet', 'wolfear', 'scale', 'seal', 'flame', 'mask', 'plume', 'shield'];
const EYE_STYLES = ['determined', 'sly', 'fierce', 'calm', 'stern', 'narrow', 'sharp', 'closed'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function deriveVariantDef(id) {
  const baseId = id.split('_')[0];
  const base = PORTRAIT_DEFS[baseId];
  if (!base) return null;
  const h = hashStr(id);
  return {
    ...base,
    hairStyle: HAIR_STYLES[h % HAIR_STYLES.length],
    accessory: ACCESSORIES[Math.floor(h / HAIR_STYLES.length) % ACCESSORIES.length],
    eyes: EYE_STYLES[Math.floor(h / (HAIR_STYLES.length * ACCESSORIES.length)) % EYE_STYLES.length],
  };
}

// 国IDから肖像画canvasを取得する(キャッシュ済みなら使い回す)
export function getPortraitCanvas(nationId) {
  if (portraitCache.has(nationId)) return portraitCache.get(nationId);
  const def = PORTRAIT_DEFS[nationId] || deriveVariantDef(nationId);
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const ctx = canvas.getContext('2d');
  if (def) {
    drawPortrait(ctx, def);
  } else {
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.arc(PORTRAIT_SIZE / 2, PORTRAIT_SIZE / 2, PORTRAIT_SIZE * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  portraitCache.set(nationId, canvas);
  return canvas;
}

// <img>タグ等で使えるdata URLとして取得する
export function getPortraitDataUrl(nationId) {
  return getPortraitCanvas(nationId).toDataURL('image/png');
}
