// 各国の紋章(エンブレム)を procedural に生成する。国旗のような盾形バッジに、
// 国名の由来にちなんだシンボルを描き込む(portraits.jsの武将似顔絵とは別物、国そのものの意匠)。

const EMBLEM_SIZE = 96;
const emblemCache = new Map();

// 国ID -> シンボル種別(国名の由来にちなんだモチーフ)
const EMBLEM_DEFS = {
  reimei: 'sunburst', // 黎明の国: 夜明けの陽光
  haitetsu: 'gear', // 廃鉄の国: 錆びた歯車
  haga: 'fangs', // 覇牙の国: 牙
  shinkyu: 'bow', // 神弓の国: 神弓
  kyogan: 'mountain', // 巨岩の国: 巨岩
  inrou: 'wolf', // 隠狼の国: 狼
  ryusen: 'spear', // 龍穿の国: 龍を穿つ槍
  fuin: 'seal', // 封印の国: 封印の呪符
  rekka: 'flame', // 烈火の国: 炎
  soukai: 'wave', // 蒼海の国: 波
  lasel: 'void', // 深淵の軍勢: 深淵の眼
};

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

// #rrggbb を指定割合だけ明るく/暗くする(amountが正なら明るく、負なら暗く)
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 0xff) + amount);
  const g = clamp(((n >> 8) & 0xff) + amount);
  const b = clamp((n & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

function shieldPath(ctx, cx, cy, w, h) {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, cy + h * 0.06);
  ctx.quadraticCurveTo(right, cy + h * 0.42, cx, cy + h * 0.5);
  ctx.quadraticCurveTo(left, cy + h * 0.42, left, cy + h * 0.06);
  ctx.closePath();
}

function drawSymbol(ctx, type, cx, cy, r, color) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(30,20,20,0.55)';
  ctx.lineWidth = r * 0.08;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (type) {
    case 'sunburst': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const x1 = cx + Math.cos(a) * r * 0.55;
        const y1 = cy + Math.sin(a) * r * 0.55;
        const x2 = cx + Math.cos(a) * r * 0.95;
        const y2 = cy + Math.sin(a) * r * 0.95;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = r * 0.14;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      break;
    }
    case 'gear': {
      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (Math.PI * 2 * i) / teeth;
        const a1 = a0 + (Math.PI * 2) / teeth / 2;
        const a2 = a0 + (Math.PI * 2) / teeth;
        ctx.lineTo(cx + Math.cos(a0) * r * 0.55, cy + Math.sin(a0) * r * 0.55);
        ctx.lineTo(cx + Math.cos(a0) * r * 0.95, cy + Math.sin(a0) * r * 0.95);
        ctx.lineTo(cx + Math.cos(a1) * r * 0.95, cy + Math.sin(a1) * r * 0.95);
        ctx.lineTo(cx + Math.cos(a2) * r * 0.55, cy + Math.sin(a2) * r * 0.55);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fangs': {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + dir * r * 0.1, cy - r * 0.6);
        ctx.quadraticCurveTo(cx + dir * r * 0.75, cy - r * 0.1, cx + dir * r * 0.28, cy + r * 0.75);
        ctx.quadraticCurveTo(cx + dir * r * 0.12, cy + r * 0.1, cx, cy - r * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'bow': {
      ctx.lineWidth = r * 0.13;
      ctx.beginPath();
      ctx.arc(cx + r * 0.15, cy, r * 0.82, Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15 + Math.cos(Math.PI * 0.62) * r * 0.82, cy + Math.sin(Math.PI * 0.62) * r * 0.82);
      ctx.lineTo(cx + r * 0.15 + Math.cos(Math.PI * 1.38) * r * 0.82, cy + Math.sin(Math.PI * 1.38) * r * 0.82);
      ctx.lineWidth = r * 0.06;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy);
      ctx.lineTo(cx + r * 0.55, cy);
      ctx.lineWidth = r * 0.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.55, cy);
      ctx.lineTo(cx + r * 0.28, cy - r * 0.18);
      ctx.lineTo(cx + r * 0.28, cy + r * 0.18);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'mountain': {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy + r * 0.6);
      ctx.lineTo(cx - r * 0.15, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.35, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eaf4ff';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.15, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.32, cy - r * 0.28);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wolf': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.85);
      ctx.lineTo(cx - r * 0.65, cy - r * 0.15);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.6);
      ctx.lineTo(cx, cy + r * 0.2);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.6);
      ctx.lineTo(cx + r * 0.65, cy - r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.22, cy - r * 0.05, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 0.22, cy - r * 0.05, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spear': {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-r * 0.09, -r * 0.85, r * 0.18, r * 1.5);
      ctx.strokeRect(-r * 0.09, -r * 0.85, r * 0.18, r * 1.5);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(-r * 0.28, -r * 0.7);
      ctx.lineTo(r * 0.28, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'seal': {
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.32, cy - r * 0.32);
      ctx.lineTo(cx + r * 0.32, cy + r * 0.32);
      ctx.moveTo(cx + r * 0.32, cy - r * 0.32);
      ctx.lineTo(cx - r * 0.32, cy + r * 0.32);
      ctx.moveTo(cx, cy - r * 0.5);
      ctx.lineTo(cx, cy + r * 0.5);
      ctx.moveTo(cx - r * 0.5, cy);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.lineWidth = r * 0.07;
      ctx.stroke();
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.95);
      ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 0.3, cx + r * 0.2, cy + r * 0.15);
      ctx.quadraticCurveTo(cx + r * 0.42, cy + r * 0.2, cx, cy + r * 0.85);
      ctx.quadraticCurveTo(cx - r * 0.42, cy + r * 0.2, cx - r * 0.2, cy + r * 0.15);
      ctx.quadraticCurveTo(cx - r * 0.55, cy - r * 0.3, cx, cy - r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'wave': {
      for (const dy of [-r * 0.22, r * 0.28]) {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.9, cy + dy);
        ctx.quadraticCurveTo(cx - r * 0.45, cy + dy - r * 0.35, cx, cy + dy);
        ctx.quadraticCurveTo(cx + r * 0.45, cy + dy + r * 0.35, cx + r * 0.9, cy + dy);
        ctx.lineWidth = r * 0.16;
        ctx.stroke();
      }
      break;
    }
    case 'void':
    default: {
      ctx.fillStyle = '#1a1220';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = r * 0.08;
      ctx.stroke();
      ctx.fillStyle = '#c85fff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.16, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawEmblem(ctx, nationId, color) {
  const size = EMBLEM_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const w = size * 0.78;
  const h = size * 0.86;

  const grad = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  grad.addColorStop(0, shade(color, 40));
  grad.addColorStop(1, shade(color, -35));

  shieldPath(ctx, cx, cy - 2, w, h);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = shade(color, -70);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const type = EMBLEM_DEFS[nationId] || 'sunburst';
  drawSymbol(ctx, type, cx, cy - h * 0.08, w * 0.32, color);
}

// 国IDと色から紋章canvasを取得する(キャッシュ済みなら使い回す)
export function getEmblemCanvas(nationId, color) {
  const key = `${nationId}_${color}`;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = EMBLEM_SIZE;
  canvas.height = EMBLEM_SIZE;
  const ctx = canvas.getContext('2d');
  drawEmblem(ctx, nationId, color || '#888888');
  emblemCache.set(key, canvas);
  return canvas;
}

// <img>タグ等で使えるdata URLとして取得する
export function getEmblemDataUrl(nationId, color) {
  return getEmblemCanvas(nationId, color).toDataURL('image/png');
}
