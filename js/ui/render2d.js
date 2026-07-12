// Canvas 2D による真上見下ろし(正方形グリッド・市松模様)の盤面レンダラー。
// 旧3D版(render3d.js, Three.js)と同じ公開インターフェース(draw/screenToBoard/fitBoard/resize/
// rotateBy/tiltBy/zoomAt/animateMove/hasActiveAnimations/animations)を持たせることで、
// main.js / input.js 側の呼び出しコードを一切変えずに差し替えられるようにしている。
import { TERRAIN } from '../core/terrain.js';
import { isConcealedFrom } from '../core/rules.js';
import { UNIT_TYPES } from '../core/units.js';

const TERRAIN_COLORS = {
  [TERRAIN.PLAIN]: '#8fd35a',
  [TERRAIN.FOREST]: '#4a9a4a',
  [TERRAIN.HILL]: '#9ecf72',
  [TERRAIN.MOUNTAIN]: '#b2a8cf',
  [TERRAIN.WATER]: '#7fd0f0',
  [TERRAIN.ROAD]: '#e7dab6',
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// 16進カラーを指定係数で暗く/明るくする(起伏の側面の陰影づけに使う)
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 0xff) * factor), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 0xff) * factor), 0, 255);
  const b = clamp(Math.round((n & 0xff) * factor), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 1;
    this.viewerFlip = false;
    this.animations = new Map();

    this.tileSize = 32; // 正方形1マスの一辺(px、board空間)
    this.originX = 0; // 盤面の中心(gx=gy=(size-1)/2)をどのスクリーン座標に置くか
    this.originY = 0;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._lastPan = null;

    this.cssWidth = 300;
    this.cssHeight = 300;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._terrainCanvas = null; // オフスクリーンにベイクした地形レイヤー(グリッド変更時のみ再構築)
    this._lastGrid = null;
    this._waterPhase = 0;
    this._squadImageCache = new Map(); // visualKey -> offscreen canvas(ちびキャラアイコン)
  }

  // ---------- 座標変換(グリッド <-> 盤面空間 <-> スクリーン) ----------
  // 「盤面空間」= zoom/pan適用前の、tileSizeで決まる論理ピクセル座標(正方形グリッド)。
  // 実際のスクリーン座標は ctx の setTransform(zoom, ..., originX+panX, originY+panY) で得られる。
  flipXY(gx, gy) {
    if (!this.viewerFlip) return { x: gx, y: gy };
    return { x: this.size - 1 - gx, y: this.size - 1 - gy };
  }

  // 真上見下ろしの正方形グリッドでは高低差を空間的なズレとしては表現しない(APIの互換のため残す)
  elevationAt() {
    return 0;
  }

  // グリッド座標を盤面空間座標(タイル中心)に変換する
  boardPos(gx, gy) {
    const { x, y } = this.flipXY(gx, gy);
    const half = (this.size - 1) / 2;
    return {
      x: (x - half) * this.tileSize,
      y: (y - half) * this.tileSize,
    };
  }

  applyTransform() {
    const ctx = this.ctx;
    const s = this.dpr * this.zoom;
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.originX + this.panX), this.dpr * (this.originY + this.panY));
  }

  // ---------- カメラ操作(旧3D版と同じメソッド名で互換を保つ) ----------
  // 疑似アイソメの固定角度では回転・チルトは意味を持たないため、no-opとして残す
  // (input.jsのピンチ回転ジェスチャがrotateByを無条件に呼ぶため、メソッド自体は必要)
  rotateBy() {}
  rotateCW() {}
  rotateCCW() {}
  tiltBy() {}

  zoomAt(scaleDelta, sx, sy) {
    const newZoom = clamp(this.zoom * scaleDelta, 0.4, 3);
    if (typeof sx === 'number' && typeof sy === 'number') {
      const relX = (sx - this.originX - this.panX) / this.zoom;
      const relY = (sy - this.originY - this.panY) / this.zoom;
      this.panX = sx - this.originX - newZoom * relX;
      this.panY = sy - this.originY - newZoom * relY;
    }
    this.zoom = newZoom;
  }

  panScreen(sx, sy) {
    if (this._lastPan) {
      this.panX += sx - this._lastPan.x;
      this.panY += sy - this._lastPan.y;
    }
    this._lastPan = { x: sx, y: sy };
  }

  panEnd() {
    this._lastPan = null;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  fitBoard(size) {
    this.size = size;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._lastPan = null;
    const padW = Math.max(60, this.cssWidth * 0.94);
    const padH = Math.max(60, this.cssHeight * 0.88);
    this.tileSize = clamp(Math.min(padW / size, padH / size), 12, 90);
    this.originX = this.cssWidth / 2;
    this.originY = this.cssHeight / 2;
    this._lastGrid = null; // tileSizeが変わるので地形キャッシュを必ず作り直す
  }

  // ---------- 画面座標 -> グリッド座標 ----------
  screenToBoard(sx, sy) {
    const relX = (sx - this.originX - this.panX) / this.zoom;
    const relY = (sy - this.originY - this.panY) / this.zoom;
    const half = (this.size - 1) / 2;
    let gx = Math.round(relX / this.tileSize + half);
    let gy = Math.round(relY / this.tileSize + half);
    if (this.viewerFlip) {
      gx = this.size - 1 - gx;
      gy = this.size - 1 - gy;
    }
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return { x: -1, y: -1 };
    return { x: gx, y: gy };
  }

  // ---------- 移動アニメーション ----------
  animateMove(state, squad, fromX, fromY, toX, toY, duration = 350) {
    this.animations.set(squad.id, { fromX, fromY, toX, toY, start: performance.now(), duration });
  }

  hasActiveAnimations() {
    return this.animations.size > 0;
  }

  getAnimatedGrid(squad) {
    const anim = this.animations.get(squad.id);
    if (!anim) return null;
    const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
    if (t >= 1) {
      this.animations.delete(squad.id);
      return null;
    }
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const gx = anim.fromX + (anim.toX - anim.fromX) * ease;
    const gy = anim.fromY + (anim.toY - anim.fromY) * ease;
    return { gx, gy };
  }

  // ---------- 描画本体 ----------
  draw(state, view) {
    this.viewerFlip = view.viewerId === 'B';
    if (this._lastGrid !== state.grid || this.size !== state.size) {
      this.size = state.size;
      this._buildTerrainLayer(state);
      this._lastGrid = state.grid;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform();

    if (this._terrainCanvas) {
      ctx.drawImage(this._terrainCanvas, this._terrainOriginX, this._terrainOriginY);
    }
    this._drawWaterShimmer(state);
    this._drawHighlights(state, view);
    this._drawSquads(state, view);
  }

  // ---------- 地形レイヤー(グリッド変更時のみ再構築してオフスクリーンcanvasにキャッシュする) ----------
  _buildTerrainLayer(state) {
    const size = state.size;
    const t = this.tileSize;
    const margin = t * 0.8; // 城アイコンなどがマス外にはみ出す分の余白
    const w = size * t + margin * 2;
    const h = size * t + margin * 2;
    this._terrainOriginX = -(size * t) / 2 - margin;
    this._terrainOriginY = -(size * t) / 2 - margin;

    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.ceil(w));
    off.height = Math.max(1, Math.ceil(h));
    const ctx = off.getContext('2d');
    ctx.translate(-this._terrainOriginX, -this._terrainOriginY);

    this._waterTiles = [];
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const terrain = state.grid[gy][gx].terrain;
        const pos = this.boardPos(gx, gy);
        const checker = (gx + gy) % 2 === 0;
        this._drawTile(ctx, pos.x, pos.y, terrain, checker, gx, gy);
        if (terrain === TERRAIN.WATER) this._waterTiles.push({ x: pos.x, y: pos.y });
      }
    }
    if (state.landmark) this._drawLandmark(ctx, state);
    this._terrainCanvas = off;
  }

  _tileRectPath(ctx, cx, cy, inset = 0) {
    const t = this.tileSize;
    ctx.beginPath();
    ctx.rect(cx - t / 2 + inset, cy - t / 2 + inset, t - inset * 2, t - inset * 2);
  }

  _drawTile(ctx, cx, cy, terrain, checker, gx, gy) {
    const t = this.tileSize;
    const base = TERRAIN_COLORS[terrain] || '#cccccc';
    const color = checker ? shade(base, 1.08) : shade(base, 0.92);
    this._tileRectPath(ctx, cx, cy);
    ctx.fillStyle = color;
    ctx.fill();

    // 山・丘は左上を明るく右下を暗くするベベルを重ね、平面グリッドのまま軽い高低差を出す
    const bumpStrength = terrain === TERRAIN.MOUNTAIN ? 0.32 : terrain === TERRAIN.HILL ? 0.16 : 0;
    if (bumpStrength > 0) {
      const grad = ctx.createLinearGradient(cx - t / 2, cy - t / 2, cx + t / 2, cy + t / 2);
      grad.addColorStop(0, `rgba(255,255,255,${bumpStrength})`);
      grad.addColorStop(0.55, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(20,15,10,${bumpStrength * 0.85})`);
      this._tileRectPath(ctx, cx, cy);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    this._drawTerrainDecor(ctx, cx, cy, terrain, gx, gy);
  }

  _drawTerrainDecor(ctx, cx, cy, terrain, gx, gy) {
    const t = this.tileSize;
    let seed = (gx * 928371 + gy * 128371 + 17) % 1000;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    if (terrain === TERRAIN.FOREST) {
      const count = rand() > 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const dx = (rand() - 0.5) * t * 0.5;
        const dy = (rand() - 0.5) * t * 0.5;
        this._drawTree(ctx, cx + dx, cy + dy, t);
      }
    } else if (terrain === TERRAIN.MOUNTAIN) {
      ctx.fillStyle = 'rgba(20,15,25,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx + t * 0.05, cy + t * 0.3, t * 0.24, t * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,60,90,0.4)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - t * 0.32);
      ctx.lineTo(cx + t * 0.28, cy + t * 0.28);
      ctx.lineTo(cx - t * 0.28, cy + t * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - t * 0.32);
      ctx.lineTo(cx + t * 0.1, cy - t * 0.05);
      ctx.lineTo(cx - t * 0.1, cy - t * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (terrain === TERRAIN.ROAD) {
      ctx.strokeStyle = 'rgba(120,95,55,0.4)';
      ctx.lineWidth = Math.max(1, t * 0.06);
      ctx.lineCap = 'round';
      for (const off of [-0.22, 0.22]) {
        ctx.beginPath();
        ctx.moveTo(cx - t * 0.4 + off * t, cy - t * 0.4);
        ctx.lineTo(cx - t * 0.4 + off * t, cy + t * 0.4);
        ctx.stroke();
      }
    } else if (terrain === TERRAIN.PLAIN || terrain === TERRAIN.HILL) {
      const count = terrain === TERRAIN.HILL ? 4 : 2;
      ctx.strokeStyle = terrain === TERRAIN.HILL ? 'rgba(40,90,30,0.5)' : 'rgba(50,110,40,0.45)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const dx = (rand() - 0.5) * t * 0.7;
        const dy = (rand() - 0.5) * t * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy + dy + 3);
        ctx.lineTo(cx + dx, cy + dy - 3);
        ctx.stroke();
      }
    }
  }

  _drawTree(ctx, cx, cy, t) {
    ctx.fillStyle = 'rgba(20,30,10,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx + t * 0.03, cy + t * 0.12, t * 0.14, t * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + t * 0.1);
    ctx.lineTo(cx, cy - t * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#3f8a45';
    ctx.beginPath();
    ctx.moveTo(cx, cy - t * 0.36);
    ctx.lineTo(cx + t * 0.18, cy - t * 0.06);
    ctx.lineTo(cx - t * 0.18, cy - t * 0.06);
    ctx.closePath();
    ctx.fill();
  }

  // ストーリーモードで、この合戦が王城/砦マスのものなら、その建物を守っている側の陣地に描く。
  // 通常の攻城戦は敵陣(B軍の最奥列)、拠点防衛戦は自陣(A軍の最奥列、盤面・配置ゾーンは反転しないため常にy=0)
  _drawLandmark(ctx, state) {
    const size = state.size;
    const gx = Math.floor((size - 1) / 2);
    const gy = state.isDefenseBattle ? 0 : size - 1;
    const pos = this.boardPos(gx, gy);
    const glyph = state.landmark === 'castle' ? '🏯' : '🛖';
    const fontSize = this.tileSize * (state.landmark === 'castle' ? 1.3 : 1.0);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, pos.x, pos.y);
  }

  // 水面のきらめきを毎フレーム軽く動かす(地形キャッシュとは別の薄い動的レイヤー)
  _drawWaterShimmer(state) {
    if (!this._waterTiles || !this._waterTiles.length) return;
    this._waterPhase += 0.02;
    const ctx = this.ctx;
    const t = this.tileSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    for (const tile of this._waterTiles) {
      ctx.beginPath();
      const off = Math.sin(this._waterPhase + tile.x * 0.05) * t * 0.12;
      ctx.moveTo(tile.x - t * 0.3, tile.y + off);
      ctx.lineTo(tile.x + t * 0.3, tile.y - off);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- ハイライト(出撃ゾーン・移動可能・攻撃対象・選択中など) ----------
  _drawHighlights(state, view) {
    const ctx = this.ctx;
    const addTile = (gx, gy, color, opacity) => {
      const pos = this.boardPos(gx, gy);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      this._tileRectPath(ctx, pos.x, pos.y, this.tileSize * 0.04);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    if (state.phase === 'deploy' && view.deployTiles) {
      for (const t of view.deployTiles) addTile(t.x, t.y, '#ffe18c', 0.55);
    }
    if (view.reachable) {
      for (const key of view.reachable.keys()) {
        const [gx, gy] = key.split(',').map(Number);
        addTile(gx, gy, '#50aaff', 0.5);
      }
    }
    if (view.meleeTargets) {
      for (const m of view.meleeTargets) addTile(m.target.x, m.target.y, '#ff5a52', 0.55);
    }
    if (view.archerTargets) {
      for (const a of view.archerTargets) addTile(a.target.x, a.target.y, '#ffa334', 0.55);
    }
    if (view.selected) addTile(view.selected.x, view.selected.y, '#ffe14d', 0.6);
    if (view.selectedGroup) {
      for (const s of view.selectedGroup) {
        if (s !== view.selected) addTile(s.x, s.y, '#ffe14d', 0.4);
      }
    }
    if (view.hoverTile) {
      addTile(view.hoverTile.x, view.hoverTile.y, view.hoverValid ? '#4ad66d' : '#ff5a52', 0.6);
    }
  }

  // ---------- 部隊(駒)の描画 ----------
  _drawSquads(state, view) {
    const ctx = this.ctx;
    const alive = state.squads.filter((s) => s.alive);
    // 真上見下ろしでは奥行きの錯覚は無いが、手前の行の駒が奥の行の駒の上に少し重なっても
    // 自然に見えるよう、行(flip後のgy)が大きいものを後から描く
    const withDepth = alive.map((squad) => {
      const anim = this.getAnimatedGrid(squad);
      const gx = anim ? anim.gx : squad.x;
      const gy = anim ? anim.gy : squad.y;
      const flipped = this.flipXY(gx, gy);
      return { squad, gx, gy, depth: flipped.y };
    });
    withDepth.sort((a, b) => a.depth - b.depth);

    for (const { squad, gx, gy } of withDepth) {
      const concealed = isConcealedFrom(state, squad, view.viewerId);
      const pos = this.boardPos(gx, gy);
      const img = this._getSquadImage(squad, concealed);
      const unitH = this.tileSize * 1.15;
      const unitW = unitH * (ICON_W / ICON_H);
      const feetY = pos.y + this.tileSize * 0.42;
      ctx.globalAlpha = squad.actedThisTurn ? 0.55 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(pos.x, feetY - unitH * 0.04, this.tileSize * 0.26, this.tileSize * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, pos.x - unitW / 2, feetY - unitH, unitW, unitH);
      ctx.globalAlpha = 1;
      this._drawCountBadge(ctx, pos.x, feetY - unitH - this.tileSize * 0.06, concealed ? '???' : String(squad.count), squad);
    }
  }

  // 兵数バッジ: 背景はチームカラー。大将は金、副将は銀とチームカラーの縞模様にする
  _drawCountBadge(ctx, cx, cy, text, squad) {
    const w = this.tileSize * 0.92;
    const h = Math.max(9, this.tileSize * 0.22);
    const teamColor = OWNER_COLORS_HEX[squad?.ownerId]?.[1] || '#888';
    ctx.fillStyle = 'rgba(30,20,20,0.85)';
    roundRectPath(ctx, cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2, h / 2 + 1);
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = teamColor;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    if (squad?.isGeneral || squad?.isViceGeneral) {
      ctx.fillStyle = squad.isGeneral ? '#ffd93d' : '#c9d3dc';
      const stripeW = h * 0.5;
      const step = stripeW * 2;
      for (let x = cx - w / 2 - h; x < cx + w / 2 + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, cy - h / 2 - 2);
        ctx.lineTo(x + stripeW, cy - h / 2 - 2);
        ctx.lineTo(x + stripeW - h, cy + h / 2 + 2);
        ctx.lineTo(x - h, cy + h / 2 + 2);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.font = `bold ${Math.max(9, h * 0.78)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeText(text, cx, cy + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cx, cy + 1);
  }

  _getSquadImage(squad, concealed) {
    const baseType = squad.baseType || squad.type;
    const key = concealed
      ? 'concealed'
      : `${baseType}_${squad.ownerId}_${!!squad.isGeneral}_${!!squad.isViceGeneral}`;
    if (this._squadImageCache.has(key)) return this._squadImageCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = ICON_W;
    canvas.height = ICON_H;
    const ctx = canvas.getContext('2d');
    if (concealed) drawSilhouetteChibi(ctx);
    else drawUnitChibi(ctx, squad, baseType);
    this._squadImageCache.set(key, canvas);
    return canvas;
  }
}

// ---------- 兵種ごとのデフォルメキャラクターをcanvas 2Dで直接描く ----------
// (旧3D版ではこれをテクスチャ化してスプライトに貼っていたが、2D版ではオフスクリーンcanvasに
// キャッシュしたものをそのままdrawImageで盤面に貼るだけでよい)
const ICON_W = 160;
const ICON_H = 200;
const OWNER_COLORS_HEX = { A: ['#9fd4ff', '#3d7fd6'], B: ['#ffb3ae', '#d64d47'] };

function drawSilhouetteChibi(ctx) {
  const cx = ICON_W / 2;
  ctx.fillStyle = '#b9b7c4';
  ctx.beginPath();
  ctx.ellipse(cx, 148, 46, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, 70, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, 74);
}

function drawUnitChibi(ctx, squad, baseType) {
  const cx = ICON_W / 2;
  const groundY = 190;
  const [c1, c2] = OWNER_COLORS_HEX[squad.ownerId] ?? ['#aaa', '#888'];
  const isCavalry = baseType === UNIT_TYPES.CAVALRY;
  let riderY = groundY;

  if (isCavalry) {
    riderY = groundY - 34;
    drawHorse(ctx, cx, groundY);
  } else {
    drawLegsIcon(ctx, cx, groundY);
  }

  if (baseType === UNIT_TYPES.ARCHER) drawBowIcon(ctx, cx, riderY);
  else drawSpearIcon(ctx, cx, riderY, isCavalry ? 0.7 : 1);
  if (baseType === UNIT_TYPES.INFANTRY) drawShieldIcon(ctx, cx, riderY, c1, c2);

  drawTorsoAndHeadIcon(ctx, cx, riderY, c1, c2);

  if (squad.isGeneral) drawCrownIcon(ctx, cx, riderY);
  else if (squad.isViceGeneral) drawViceBadgeIcon(ctx, cx, riderY);
}

function drawLegsIcon(ctx, cx, groundY) {
  ctx.strokeStyle = 'rgba(70,55,45,0.7)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12, groundY - 30);
  ctx.lineTo(cx - 16, groundY);
  ctx.moveTo(cx + 12, groundY - 30);
  ctx.lineTo(cx + 16, groundY);
  ctx.stroke();
}

function drawTorsoAndHeadIcon(ctx, cx, baseY, c1, c2) {
  const grad = ctx.createLinearGradient(cx, baseY - 70, cx, baseY - 10);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 42, 32, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffe3c4';
  ctx.beginPath();
  ctx.arc(cx, baseY - 96, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,110,75,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#2a2a35';
  ctx.beginPath();
  ctx.ellipse(cx - 10, baseY - 98, 4, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 10, baseY - 98, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpearIcon(ctx, cx, baseY, lengthMul) {
  const x1 = cx + 26;
  const y1 = baseY - 20;
  const x2 = cx + 10;
  const y2 = baseY - 96 * lengthMul - 40;
  ctx.strokeStyle = '#8a5a3a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.fillStyle = '#c9cdd6';
  ctx.beginPath();
  ctx.moveTo(x2, y2 - 16);
  ctx.lineTo(x2 + 9, y2 + 4);
  ctx.lineTo(x2 - 9, y2 + 4);
  ctx.closePath();
  ctx.fill();
}

function drawBowIcon(ctx, cx, baseY) {
  const bx = cx - 38;
  const midY = baseY - 55;
  ctx.strokeStyle = '#8a5a3a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, midY - 38);
  ctx.quadraticCurveTo(bx - 26, midY, bx, midY + 38);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, midY - 38);
  ctx.lineTo(bx, midY + 38);
  ctx.stroke();
}

function drawShieldIcon(ctx, cx, baseY, c1, c2) {
  const grad = ctx.createLinearGradient(cx - 46, baseY - 60, cx - 22, baseY - 20);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx - 34, baseY - 42, 13, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawHorse(ctx, cx, groundY) {
  const hy = groundY - 30;
  ctx.fillStyle = '#a9754f';
  ctx.beginPath();
  ctx.ellipse(cx, hy, 50, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5638';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const dx of [-28, -10, 10, 28]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, hy + 18);
    ctx.lineTo(cx + dx, groundY);
    ctx.stroke();
  }
  ctx.fillStyle = '#a9754f';
  ctx.beginPath();
  ctx.ellipse(cx + 40, hy - 18, 14, 20, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 56, hy - 38, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5e4028';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 30, hy - 30);
  ctx.lineTo(cx + 44, hy - 22);
  ctx.stroke();
}

function drawCrownIcon(ctx, cx, baseY) {
  const cy = baseY - 138;
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 10);
  ctx.lineTo(cx - 18, cy - 2);
  ctx.lineTo(cx - 8, cy + 8);
  ctx.lineTo(cx, cy - 10);
  ctx.lineTo(cx + 8, cy + 8);
  ctx.lineTo(cx + 18, cy - 2);
  ctx.lineTo(cx + 18, cy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,110,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawViceBadgeIcon(ctx, cx, baseY) {
  const cy = baseY - 132;
  const spikes = 5;
  const outerR = 13;
  const innerR = 6;
  ctx.fillStyle = '#c9d3dc';
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const ang = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,100,110,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
