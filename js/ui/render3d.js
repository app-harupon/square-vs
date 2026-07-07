// Three.js(CDN経由)による本格3Dレンダラー。盤面(地形)・駒ともに3Dシーンとして描画する。
// 既存の2D版Renderer(render.js)と同じ公開インターフェース(draw/screenToBoard/fitBoard/resize/
// rotateBy/tiltBy/zoomAt/animateMove/hasActiveAnimations/animations/camera)を持たせることで、
// main.js / input.js 側の呼び出しコードを変えずに差し替えられるようにしている。
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { TERRAIN } from '../core/terrain.js';
import { isConcealedFrom } from '../core/rules.js';
import { UNIT_TYPES } from '../core/units.js';

const TILE_SIZE = 1;
const ELEVATION_UNIT = { [TERRAIN.HILL]: 0.24, [TERRAIN.MOUNTAIN]: 0.6 };
const BASE_THICKNESS = 0.3;

const TERRAIN_COLORS = {
  [TERRAIN.PLAIN]: 0xbfe89a,
  [TERRAIN.FOREST]: 0x5fae5f,
  [TERRAIN.HILL]: 0x9ecf72,
  [TERRAIN.MOUNTAIN]: 0xb2a8cf,
  [TERRAIN.WATER]: 0x8fd8f5,
  [TERRAIN.ROAD]: 0xe7dab6,
};

// 背景の空グラデーション+雲をcanvasに描いてテクスチャ化する(単色より奥行きのある見た目にする)
let cachedSkyTexture = null;
function createSkyTexture() {
  if (cachedSkyTexture) return cachedSkyTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#7fb2e6');
  grad.addColorStop(0.45, '#bfe0f5');
  grad.addColorStop(0.75, '#eaf6ff');
  grad.addColorStop(1, '#fdfdf0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 柔らかい雲を数個散らす
  const clouds = [
    { x: 110, y: 120, s: 70 }, { x: 380, y: 90, s: 55 }, { x: 250, y: 180, s: 85 },
    { x: 60, y: 260, s: 50 }, { x: 430, y: 230, s: 60 }, { x: 300, y: 320, s: 65 },
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.s, c.s * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.s * 0.55, c.y + c.s * 0.08, c.s * 0.65, c.s * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - c.s * 0.5, c.y + c.s * 0.1, c.s * 0.55, c.s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedSkyTexture = texture;
  return texture;
}

// 川面: 波模様を描き、テクスチャをスクロールさせることで水流のアニメーションを表現する
let cachedWaterTexture = null;
function createWaterTexture() {
  if (cachedWaterTexture) return cachedWaterTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 64);
  bgGrad.addColorStop(0, '#a0e0f5');
  bgGrad.addColorStop(1, '#7fcdf0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2.4;
  for (let y = -10; y < 74; y += 12) {
    ctx.beginPath();
    for (let x = 0; x <= 64; x += 4) {
      const wy = y + Math.sin((x / 64) * Math.PI * 2) * 3.5;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.4;
  for (let y = -4; y < 74; y += 12) {
    ctx.beginPath();
    for (let x = 0; x <= 64; x += 4) {
      const wy = y + Math.sin((x / 64) * Math.PI * 2 + 1.4) * 3;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  cachedWaterTexture = texture;
  return texture;
}

// 山肌: ごつごつした岩の質感をランダムな斑点・ひび割れ調の陰影で表現する
let cachedRockTexture = null;
function createRockTexture() {
  if (cachedRockTexture) return cachedRockTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a79cc2';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 90; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    const r = 4 + rand() * 10;
    const shade = rand() > 0.5 ? `rgba(70,60,90,${0.12 + rand() * 0.18})` : `rgba(255,255,255,${0.08 + rand() * 0.16})`;
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(50,42,70,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = rand() * 128;
    let y = rand() * 128;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 30;
      y += (rand() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  cachedRockTexture = texture;
  return texture;
}

// 道: 踏み固められた土に小石や轍(わだち)が見える、使い込まれた小道の質感を表現する
let cachedRoadTexture = null;
function createRoadTexture() {
  if (cachedRoadTexture) return cachedRoadTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const bgGrad = ctx.createLinearGradient(0, 0, 128, 128);
  bgGrad.addColorStop(0, '#d8bd8e');
  bgGrad.addColorStop(1, '#c9a877');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 128, 128);

  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  // 踏み固められ具合を表す薄い斑点
  for (let i = 0; i < 70; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    const r = 3 + rand() * 7;
    const shade = rand() > 0.5 ? `rgba(150,115,70,${0.1 + rand() * 0.15})` : `rgba(255,240,210,${0.12 + rand() * 0.18})`;
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // 轍(2本のわだち)
  ctx.strokeStyle = 'rgba(110,80,45,0.35)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const offset of [-22, 22]) {
    ctx.beginPath();
    for (let y = -10; y <= 138; y += 8) {
      const x = 64 + offset + Math.sin(y / 40) * 6;
      if (y === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 小石
  ctx.fillStyle = 'rgba(90,70,50,0.5)';
  for (let i = 0; i < 26; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.4 + rand() * 1.6, 1 + rand() * 1.2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  cachedRoadTexture = texture;
  return texture;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.size = 1;
    this.angle = 0; // 互換用(2D版のプロパティ名を踏襲)
    this.tiltFactor = 1;
    this.viewerFlip = false;
    this.animations = new Map();

    this.azimuth = Math.PI / 4;
    this.polar = 0.92; // 0に近いほど真上から、大きいほど横から見た感じになる
    this.distance = 10;
    this.target = { x: 0, z: 0 }; // カメラが注視する(=盤面をスライドさせる)ワールド座標上の点
    this.camera = { x: 0, y: 0, scale: 1 }; // input.js互換ダミー(実際のパンはpanScreen/panEndで1:1追従させる)
    this._lastPanWorld = null; // パン中の直前フレームでの接地点(ワールド座標)

    this._waterMaterials = []; // 川の流れアニメーション対象
    this._grassTufts = []; // 風で揺れる草むらデコレーション({mesh, phase})
    this._ambientClock = 0;

    this.scene = new THREE.Scene();
    this.scene.background = createSkyTexture(); // 単色ではなく雲入りの空グラデーションにする
    this.scene.fog = new THREE.Fog(0xd9ecf7, 16, 62); // 遠景をわずかにかすませて奥行きを強調する(空の色に合わせる)
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.renderer3 = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer3.setPixelRatio(this.dpr);
    this.renderer3.shadowMap.enabled = true;
    this.renderer3.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdce6ea, 0.75)); // 空と地面からの柔らかい補助光で暗部を持ち上げる
    const sun = new THREE.DirectionalLight(0xfff8ec, 0.7);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.bias = -0.0015;
    sun.shadow.radius = 3; // 影の縁をやわらかくボケさせる(PCFSoftShadowMap時に効く)
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;

    this.tileGroup = new THREE.Group();
    this.decorGroup = new THREE.Group();
    this.highlightGroup = new THREE.Group();
    this.squadGroup = new THREE.Group();
    this.scene.add(this.tileGroup, this.decorGroup, this.highlightGroup, this.squadGroup);

    this.tileMeshes = []; // {mesh, gx, gy}
    this.squadMeshes = new Map(); // squadId -> group

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._startAmbientLoop();
  }

  // 川の水流・草の揺れなど、ターン進行と無関係に常時ゆっくり動かしたい演出専用のループ。
  // ゲーム状態の更新を伴わないため、main.js側のdraw()呼び出しとは独立して動かす。
  // 揺らぎはゆっくりなので、電池消費を抑えるため意図的に低フレームレート(約12fps)に間引く。
  _startAmbientLoop() {
    let last = performance.now();
    let acc = 0;
    const FRAME_INTERVAL = 1 / 12;
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this._ambientClock += dt;
      acc += dt;
      if (acc >= FRAME_INTERVAL && (this._waterMaterials.length || this._grassTufts.length)) {
        acc = 0;
        for (const mat of this._waterMaterials) {
          if (mat.map) mat.map.offset.y = (this._ambientClock * 0.06) % 1;
        }
        for (const tuft of this._grassTufts) {
          const sway = Math.sin(this._ambientClock * 1.6 + tuft.phase) * 0.14;
          tuft.mesh.rotation.z = sway;
          tuft.mesh.rotation.x = sway * 0.5;
        }
        this.renderer3.render(this.scene, this.perspCamera);
      }
      this._ambientLoopId = requestAnimationFrame(tick);
    };
    this._ambientLoopId = requestAnimationFrame(tick);
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
    this.polar = 0.92;
    // 縦横比(特に縦長のスマホ画面)を考慮し、盤面全体が収まる距離を計算する
    const halfExtent = Math.max(1, (size - 1) / 2) * Math.SQRT2 + 1.4;
    const vFov = (this.perspCamera.fov * Math.PI) / 180;
    const aspect = this.perspCamera.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distV = halfExtent / Math.tan(vFov / 2);
    const distH = halfExtent / Math.tan(hFov / 2);
    this.distance = Math.max(distV, distH, 6);
    // 距離に応じてカメラの描画距離とフォグの効き始め/終わりを調整する(遠景が消えたり靄で潰れたりしないように)
    const farClip = Math.max(150, this.distance * 2.2);
    this.perspCamera.far = farClip;
    this.perspCamera.updateProjectionMatrix();
    if (this.scene.fog) {
      this.scene.fog.near = Math.max(16, this.distance * 1.35);
      this.scene.fog.far = Math.max(62, this.distance * 2.1);
    }
    this.target.x = 0;
    this.target.z = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    this._lastPanWorld = null;
  }

  _updateCamera() {
    const r = this.distance;
    const px = this.target.x + r * Math.sin(this.polar) * Math.sin(this.azimuth);
    const pz = this.target.z + r * Math.sin(this.polar) * Math.cos(this.azimuth);
    const py = r * Math.cos(this.polar);
    this.perspCamera.position.set(px, py, pz);
    this.perspCamera.lookAt(this.target.x, 0, this.target.z);
    this.perspCamera.updateMatrixWorld(true); // パン時のレイキャストが直後に古い行列を参照しないよう即時反映する

    if (this.sunLight) {
      this.sunLight.position.set(this.target.x + 8, 16, this.target.z + 6);
      this.sunLight.target.position.set(this.target.x, 0, this.target.z);
    }
  }

  // 画面座標(キャンバス内ローカル座標)を地面(y=0)平面に投影し、指の下の地点が常に
  // 指の下にとどまるように注視点を動かす(=1:1のドラッグでそのまま盤面をスライドさせる)
  panScreen(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = (sx / rect.width) * 2 - 1;
    const ndcY = -(sy / rect.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.perspCamera);
    const point = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, point);
    if (!hit) {
      this._lastPanWorld = null;
      return;
    }
    if (this._lastPanWorld) {
      const half = Math.max(1, this.size) * 0.9;
      this.target.x = clamp(this.target.x - (point.x - this._lastPanWorld.x), -half, half);
      this.target.z = clamp(this.target.z - (point.z - this._lastPanWorld.z), -half, half);
    }
    this._lastPanWorld = { x: point.x, z: point.z };
  }

  panEnd() {
    this._lastPanWorld = null;
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
    this._waterMaterials = [];
    this._grassTufts = [];
    const size = state.size;
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const terrain = state.grid[gy][gx].terrain;
        const elevation = ELEVATION_UNIT[terrain] || 0;
        const height = terrain === TERRAIN.WATER ? 0.06 : BASE_THICKNESS + elevation;
        const centerY = terrain === TERRAIN.WATER ? -height / 2 : elevation - height / 2;
        const geo = new THREE.BoxGeometry(TILE_SIZE * 0.985, height, TILE_SIZE * 0.985);
        const matOpts = { color: TERRAIN_COLORS[terrain], roughness: 0.85 };
        if (terrain === TERRAIN.WATER) {
          matOpts.map = createWaterTexture();
          matOpts.color = 0xffffff;
          matOpts.roughness = 0.25;
          matOpts.metalness = 0;
          matOpts.emissive = 0x336a8a;
          matOpts.emissiveIntensity = 0.15;
        } else if (terrain === TERRAIN.MOUNTAIN) {
          matOpts.map = createRockTexture();
          matOpts.color = 0xffffff;
        } else if (terrain === TERRAIN.ROAD) {
          matOpts.map = createRoadTexture();
          matOpts.color = 0xffffff;
        }
        const mat = new THREE.MeshStandardMaterial(matOpts);
        if (terrain === TERRAIN.WATER) this._waterMaterials.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const center = this.tileCenter(gx, gy, 0);
        mesh.position.set(center.x, centerY, center.z);
        mesh.userData = { gx, gy };
        this.tileGroup.add(mesh);
        this.tileMeshes.push({ mesh, gx, gy });
        this._addTerrainDecor(terrain, gx, gy, elevation);
      }
    }
    if (state.landmark) this._addCastle(state);
  }

  // ストーリーモードで、この合戦が王城/砦マスのものなら、敵陣(B軍の出撃ゾーン奥)に城を配置する
  _addCastle(state) {
    const size = state.size;
    const gx = Math.floor((size - 1) / 2);
    const gy = size - 1; // B軍(敵)の最奥列
    const terrain = state.grid[gy][gx].terrain;
    const elevation = ELEVATION_UNIT[terrain] || 0;
    const center = this.tileCenter(gx, gy, elevation);
    const scale = state.landmark === 'castle' ? 1.35 : 0.85;
    const castle = makeCastle(scale);
    castle.position.set(center.x, elevation, center.z);
    this.decorGroup.add(castle);
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
      // ごつごつした岩肌感を出すため、小さな不揃いの岩塊を根元に散らす
      const rockMat = new THREE.MeshStandardMaterial({ map: createRockTexture(), color: 0xffffff, roughness: 0.95 });
      for (let i = 0; i < 3; i++) {
        const ang = (seed * 0.13 + i * 2.4) % (Math.PI * 2);
        const dist = 0.28 + (i % 2) * 0.06;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + (i % 2) * 0.03, 0), rockMat);
        rock.position.set(center.x + Math.cos(ang) * dist, elevation + 0.02, center.z + Math.sin(ang) * dist);
        rock.rotation.set(seed * 0.01, ang, seed * 0.02);
        rock.castShadow = true;
        this.decorGroup.add(rock);
      }
    } else if (terrain === TERRAIN.PLAIN) {
      const count = seed % 2 === 0 ? 3 : 2;
      this._addGrassTufts(center, elevation, seed, count, 0x6fbf5f);
    } else if (terrain === TERRAIN.HILL) {
      // 芝が生い茂っている見た目にするため、平地より密度高め・濃い緑の草むらを配置する
      const count = 4 + (seed % 3);
      this._addGrassTufts(center, elevation, seed, count, 0x4f9e3f);
    }
  }

  // 風にそよぐ草むらを数株配置し、_startAmbientLoopで揺らす(平地・丘の両方から呼ばれる)
  _addGrassTufts(center, elevation, seed, count, colorHex) {
    const bladeMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
      const tuft = new THREE.Group();
      const bladeCount = 3;
      for (let b = 0; b < bladeCount; b++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12 + (b % 2) * 0.03, 3), bladeMat);
        blade.position.set((b - 1) * 0.03, 0.06, 0);
        blade.rotation.z = (b - 1) * 0.35;
        tuft.add(blade);
      }
      const ang = (seed * 0.7 + i * 2.1) % (Math.PI * 2);
      const dist = 0.14 + (i % 3) * 0.1;
      tuft.position.set(center.x + Math.cos(ang) * dist, elevation, center.z + Math.sin(ang) * dist);
      this.decorGroup.add(tuft);
      this._grassTufts.push({ mesh: tuft, phase: seed * 0.31 + i });
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

// 城(王城/砦)を簡易な塔+城壁の組み合わせで表現する。scaleが大きいほど王城らしい威容になる。
function makeCastle(scale = 1) {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9e4f4f, roughness: 0.75 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe0d8c4, roughness: 0.88 });

  // 中央の主塔
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.17 * scale, 0.42 * scale, 8), stoneMat);
  keep.position.y = 0.21 * scale;
  keep.castShadow = true;
  group.add(keep);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.22 * scale, 8), roofMat);
  keepRoof.position.y = 0.42 * scale + 0.11 * scale;
  keepRoof.castShadow = true;
  group.add(keepRoof);

  // 周囲の櫓(四隅)
  const towerDist = 0.32 * scale;
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i + Math.PI / 4;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.07 * scale, 0.26 * scale, 6), stoneMat);
    tower.position.set(Math.cos(ang) * towerDist, 0.13 * scale, Math.sin(ang) * towerDist);
    tower.castShadow = true;
    group.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.08 * scale, 0.14 * scale, 6), roofMat);
    roof.position.set(Math.cos(ang) * towerDist, 0.26 * scale + 0.07 * scale, Math.sin(ang) * towerDist);
    roof.castShadow = true;
    group.add(roof);
  }

  // つながりを示す低い城壁
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.62 * scale, 0.1 * scale, 0.62 * scale), wallMat);
  wall.position.y = 0.05 * scale;
  wall.castShadow = true;
  group.add(wall);

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
