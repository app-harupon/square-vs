// Three.js(CDN経由)による本格3Dレンダラー。盤面(地形)・駒ともに3Dシーンとして描画する。
// 既存の2D版Renderer(render.js)と同じ公開インターフェース(draw/screenToBoard/fitBoard/resize/
// rotateBy/tiltBy/zoomAt/animateMove/hasActiveAnimations/animations/camera)を持たせることで、
// main.js / input.js 側の呼び出しコードを変えずに差し替えられるようにしている。
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { TERRAIN } from '../core/terrain.js';
import { isConcealedFrom } from '../core/rules.js';
import { UNIT_TYPES } from '../core/units.js';

const TILE_SIZE = 1;
const ELEVATION_UNIT = { [TERRAIN.HILL]: 0.22, [TERRAIN.MOUNTAIN]: 0.55 };

const TERRAIN_COLORS = {
  [TERRAIN.PLAIN]: 0xbfe89a,
  [TERRAIN.FOREST]: 0x5fae5f,
  [TERRAIN.HILL]: 0xd9c284,
  [TERRAIN.MOUNTAIN]: 0xb2a8cf,
  [TERRAIN.WATER]: 0x6fc2ea,
  [TERRAIN.ROAD]: 0xe7dab6,
};

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.size = 1;
    this.angle = 0; // 互換用(2D版のプロパティ名を踏襲)
    this.tiltFactor = 1;
    this.viewerFlip = false;
    this.animations = new Map();

    this.azimuth = Math.PI / 4;
    this.polar = 0.85; // 0に近いほど真上から、大きいほど横から見た感じになる
    this.distance = 10;
    this.camera = { x: 0, y: 0, scale: 1 }; // input.js互換のダミー(パン操作を簡易オービットへ変換する)

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdfeeff);
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.renderer3 = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer3.setPixelRatio(this.dpr);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(6, 10, 4);
    this.scene.add(sun);

    this.tileGroup = new THREE.Group();
    this.decorGroup = new THREE.Group();
    this.highlightGroup = new THREE.Group();
    this.squadGroup = new THREE.Group();
    this.scene.add(this.tileGroup, this.decorGroup, this.highlightGroup, this.squadGroup);

    this.tileMeshes = []; // {mesh, gx, gy}
    this.squadMeshes = new Map(); // squadId -> group

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // ---------- 座標変換(グリッド <-> ワールド) ----------
  worldX(gx) {
    return gx - (this.size - 1) / 2;
  }
  worldZ(gy) {
    return gy - (this.size - 1) / 2;
  }
  elevationAt(state, gx, gy) {
    const terrain = state.grid[gy][gx].terrain;
    return ELEVATION_UNIT[terrain] || 0;
  }

  tileCenter(gx, gy, elevationWorld = 0) {
    // 2D版と同名の互換メソッド。ワールド座標をそのまま返す(スクリーン座標ではない点に注意)
    let x = gx;
    let y = gy;
    if (this.viewerFlip) {
      x = this.size - 1 - gx;
      y = this.size - 1 - gy;
    }
    return { x: this.worldX(x), y: elevationWorld, z: this.worldZ(y) };
  }

  // ---------- カメラ操作(2D版と同じメソッド名で互換を保つ) ----------
  rotateBy(deltaRad) {
    this.azimuth += deltaRad;
  }
  rotateCW() {
    this.rotateBy(Math.PI / 2);
  }
  rotateCCW() {
    this.rotateBy(-Math.PI / 2);
  }
  tiltBy(delta) {
    this.polar = Math.max(0.25, Math.min(1.4, this.polar + delta));
  }
  zoomAt(scaleDelta) {
    // 30x30盤面全体を収めるにはdistanceが100を超えることもあるため、上限は盤面サイズに応じて決める
    const maxDistance = Math.max(40, this.size * 5);
    this.distance = Math.max(3, Math.min(maxDistance, this.distance / scaleDelta));
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.renderer3.setSize(rect.width, rect.height, false);
    this.perspCamera.aspect = rect.width / Math.max(1, rect.height);
    this.perspCamera.updateProjectionMatrix();
  }

  fitBoard(size) {
    this.size = size;
    this.azimuth = Math.PI / 4;
    this.polar = 0.85;
    // 縦横比(特に縦長のスマホ画面)を考慮し、盤面全体が収まる距離を計算する
    const halfExtent = Math.max(1, (size - 1) / 2) * Math.SQRT2 + 1.4;
    const vFov = (this.perspCamera.fov * Math.PI) / 180;
    const aspect = this.perspCamera.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distV = halfExtent / Math.tan(vFov / 2);
    const distH = halfExtent / Math.tan(hFov / 2);
    this.distance = Math.max(distV, distH, 6);
    this.camera.x = 0;
    this.camera.y = 0;
  }

  _updateCamera() {
    // camera.x/yはinput.jsの1本指パン操作からの蓄積値をゆるくオービットへ変換する互換ハック
    const azimuth = this.azimuth + this.camera.x * 0.006;
    const polar = Math.max(0.25, Math.min(1.4, this.polar - this.camera.y * 0.004));
    const r = this.distance;
    const px = r * Math.sin(polar) * Math.sin(azimuth);
    const pz = r * Math.sin(polar) * Math.cos(azimuth);
    const py = r * Math.cos(polar);
    this.perspCamera.position.set(px, py, pz);
    this.perspCamera.lookAt(0, 0, 0);
  }

  screenToBoard(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = (sx / rect.width) * 2 - 1;
    const ndcY = -(sy / rect.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.perspCamera);
    const hits = this._raycaster.intersectObjects(this.tileMeshes.map((t) => t.mesh));
    if (hits.length) {
      const hit = this.tileMeshes.find((t) => t.mesh === hits[0].object);
      if (hit) return { x: hit.gx, y: hit.gy };
    }
    // タイルに当たらなければ地面(y=0)平面との交点から概算する
    const point = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._groundPlane, point)) {
      let gx = Math.round(point.x + (this.size - 1) / 2);
      let gy = Math.round(point.z + (this.size - 1) / 2);
      if (this.viewerFlip) {
        gx = this.size - 1 - gx;
        gy = this.size - 1 - gy;
      }
      return { x: gx, y: gy };
    }
    return { x: -1, y: -1 };
  }

  // ---------- 移動アニメーション(main.js/2D版と同じ呼び出し方を維持) ----------
  animateMove(state, squad, fromX, fromY, toX, toY, duration = 350) {
    const fromElev = this.elevationAt(state, fromX, fromY);
    const toElev = this.elevationAt(state, toX, toY);
    this.animations.set(squad.id, { fromX, fromY, toX, toY, fromElev, toElev, start: performance.now(), duration });
  }

  hasActiveAnimations() {
    return this.animations.size > 0;
  }

  getAnimatedPosition(squad) {
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
    const elev = anim.fromElev + (anim.toElev - anim.fromElev) * ease;
    return this.tileCenter(gx, gy, elev);
  }

  // ---------- 描画本体 ----------
  draw(state, view) {
    this.viewerFlip = view.viewerId === 'B';
    if (this._lastGrid !== state.grid || this.size !== state.size) {
      this.size = state.size;
      this._buildTerrain(state);
      this._lastGrid = state.grid;
    }
    this._updateHighlights(state, view);
    this._updateSquads(state, view);
    this._updateCamera();
    this.renderer3.render(this.scene, this.perspCamera);
  }

  _buildTerrain(state) {
    disposeGroup(this.tileGroup);
    disposeGroup(this.decorGroup);
    this.tileMeshes = [];
    const size = state.size;
    const BASE_THICKNESS = 0.2;
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const terrain = state.grid[gy][gx].terrain;
        const elevation = ELEVATION_UNIT[terrain] || 0;
        const height = terrain === TERRAIN.WATER ? 0.06 : BASE_THICKNESS + elevation;
        const centerY = terrain === TERRAIN.WATER ? -height / 2 : elevation - height / 2;
        const geo = new THREE.BoxGeometry(TILE_SIZE * 0.96, height, TILE_SIZE * 0.96);
        const mat = new THREE.MeshStandardMaterial({ color: TERRAIN_COLORS[terrain], roughness: 0.9 });
        const mesh = new THREE.Mesh(geo, mat);
        const center = this.tileCenter(gx, gy, 0);
        mesh.position.set(center.x, centerY, center.z);
        mesh.userData = { gx, gy };
        this.tileGroup.add(mesh);
        this.tileMeshes.push({ mesh, gx, gy });
        this._addTerrainDecor(terrain, gx, gy, elevation);
      }
    }
  }

  _addTerrainDecor(terrain, gx, gy, elevation) {
    const center = this.tileCenter(gx, gy, elevation);
    const seed = (gx * 928371 + gy * 128371) % 100;
    if (terrain === TERRAIN.FOREST) {
      const count = seed % 3 === 0 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const tree = makeTree();
        tree.position.set(center.x + (i === 0 ? -0.18 : 0.2), elevation, center.z + (i === 0 ? 0.12 : -0.15));
        this.decorGroup.add(tree);
      }
    } else if (terrain === TERRAIN.MOUNTAIN) {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.28, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
      );
      cap.position.set(center.x, elevation + 0.14, center.z);
      this.decorGroup.add(cap);
    }
  }

  // ---------- ハイライト(出撃ゾーン・移動可能・攻撃対象・選択中など) ----------
  _updateHighlights(state, view) {
    disposeGroup(this.highlightGroup);
    const addTile = (gx, gy, color, opacity, yOffset = 0.02) => {
      const elevation = this.elevationAt(state, gx, gy);
      const center = this.tileCenter(gx, gy, elevation + yOffset);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE * 0.88, 0.02, TILE_SIZE * 0.88),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
      );
      mesh.position.set(center.x, center.y, center.z);
      this.highlightGroup.add(mesh);
    };
    if (state.phase === 'deploy' && view.deployTiles) {
      for (const t of view.deployTiles) addTile(t.x, t.y, 0xffe18c, 0.45);
    }
    if (view.reachable) {
      for (const key of view.reachable.keys()) {
        const [gx, gy] = key.split(',').map(Number);
        addTile(gx, gy, 0x50aaff, 0.4, 0.03);
      }
    }
    if (view.meleeTargets) {
      for (const m of view.meleeTargets) addTile(m.target.x, m.target.y, 0xff5a52, 0.45, 0.04);
    }
    if (view.archerTargets) {
      for (const a of view.archerTargets) addTile(a.target.x, a.target.y, 0xffa334, 0.45, 0.04);
    }
    if (view.selected) addTile(view.selected.x, view.selected.y, 0xffe14d, 0.5, 0.05);
    if (view.selectedGroup) {
      for (const s of view.selectedGroup) {
        if (s !== view.selected) addTile(s.x, s.y, 0xffe14d, 0.32, 0.05);
      }
    }
    if (view.hoverTile) {
      addTile(view.hoverTile.x, view.hoverTile.y, view.hoverValid ? 0x4ad66d : 0xff5a52, 0.5, 0.06);
    }
  }

  // ---------- 部隊(駒)の3Dモデル ----------
  _updateSquads(state, view) {
    const aliveIds = new Set();
    for (const squad of state.squads) {
      if (!squad.alive) continue;
      aliveIds.add(squad.id);
      const concealed = isConcealedFrom(state, squad, view.viewerId);
      let group = this.squadMeshes.get(squad.id);
      const visualKey = `${squad.type}_${squad.ownerId}_${squad.isGeneral}_${squad.isViceGeneral}_${concealed}`;
      if (!group || group.userData.visualKey !== visualKey) {
        if (group) this.squadGroup.remove(group);
        group = buildSquadModel(squad, concealed);
        group.userData.visualKey = visualKey;
        this.squadGroup.add(group);
        this.squadMeshes.set(squad.id, group);
      }
      const animPos = this.getAnimatedPosition(squad);
      const elevation = animPos ? animPos.y : this.elevationAt(state, squad.x, squad.y);
      const pos = animPos || this.tileCenter(squad.x, squad.y, elevation);
      group.position.set(pos.x, pos.y, pos.z);
      // 3D版ではドラッグ中も自陣の駒はその場に留めて表示し、狙っているマスは
      // hoverTileのハイライトで示す(2D版のような画面追従ゴーストは持たない)
      group.visible = true;
      updateCountBadge(group, concealed ? '???' : String(squad.count));
      group.userData.actedThisTurn = squad.actedThisTurn;
      setGroupOpacity(group, squad.actedThisTurn ? 0.55 : 1);
    }
    for (const [id, group] of this.squadMeshes.entries()) {
      if (!aliveIds.has(id)) {
        this.squadGroup.remove(group);
        this.squadMeshes.delete(id);
      }
    }
  }
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose?.();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  }
}

function setGroupOpacity(group, opacity) {
  group.traverse((obj) => {
    if (obj.material && obj.userData.isBadge !== true) {
      // スプライトは透過PNG的なテクスチャなので、常にtransparentを有効にしておく必要がある
      obj.material.transparent = true;
      obj.material.opacity = opacity;
    }
  });
}

function makeTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3a })
  );
  trunk.position.y = 0.05;
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.24, 7),
    new THREE.MeshStandardMaterial({ color: 0x4f9e5a })
  );
  leaves.position.y = 0.2;
  group.add(trunk, leaves);
  return group;
}

function makeTextSprite(text, { scale = 0.4, bg = 'rgba(30,30,40,0.8)', fg = '#fff' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  roundRectPath(ctx, 4, 12, 120, 40, 16);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale / 2, 1);
  sprite.userData.isBadge = true;
  sprite.renderOrder = 999;
  return sprite;
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

function updateCountBadge(group, text) {
  const existing = group.userData.badge;
  if (existing && existing.userData.text === text) return;
  if (existing) {
    group.remove(existing);
    existing.material.map?.dispose();
    existing.material.dispose();
  }
  const sprite = makeTextSprite(text);
  sprite.userData.text = text;
  sprite.position.set(0, group.userData.badgeHeight || 0.55, 0);
  group.add(sprite);
  group.userData.badge = sprite;
}

// 兵種ごとのデフォルメキャラクターを2Dアイコン(canvasテクスチャ)として描き、
// どの角度から見ても同じに見えるビルボードスプライトとして配置する
const unitTextureCache = new Map();
const ICON_W = 160;
const ICON_H = 200;

function getUnitTexture(squad, concealed) {
  const baseType = squad.baseType || squad.type;
  const key = concealed
    ? 'concealed'
    : `${baseType}_${squad.ownerId}_${!!squad.isGeneral}_${!!squad.isViceGeneral}`;
  if (unitTextureCache.has(key)) return unitTextureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_W;
  canvas.height = ICON_H;
  const ctx = canvas.getContext('2d');
  if (concealed) {
    drawSilhouetteChibi(ctx);
  } else {
    drawUnitChibi(ctx, squad, baseType);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  unitTextureCache.set(key, texture);
  return texture;
}

function buildSquadModel(squad, concealed) {
  const group = new THREE.Group();
  const texture = getUnitTexture(squad, concealed);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const aspect = ICON_W / ICON_H;
  const height = 0.85;
  sprite.scale.set(height * aspect, height, 1);
  sprite.position.y = height / 2 - 0.08;
  sprite.userData.isCharacterSprite = true;
  group.add(sprite);
  group.userData.badgeHeight = height + 0.15;
  return group;
}

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

const OWNER_COLORS_HEX = { A: ['#9fd4ff', '#3d7fd6'], B: ['#ffb3ae', '#d64d47'] };

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

  // 頭
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
