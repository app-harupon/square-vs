// キャンバスのドラッグ&ドロップ(駒をつかんで動かす)/ パン / ピンチズーム / 長押しを扱う入力ハンドラ

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE = 6;
// ピンチでズームしただけのつもりが、指のブレで意図せず回転してしまうのを防ぐための遊び(度数)。
// ジェスチャー開始角度からこの角度を超えて動いて初めて回転を適用し始める
const PINCH_ROTATE_DEADZONE_DEG = 8;

export class InputController {
  constructor(canvas, renderer, { onTap, onLongPress, isDraggable, onDragStart, onDragUpdate, onDragEnd, onCameraChange }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onTap = onTap;
    this.onLongPress = onLongPress || (() => {});
    this.isDraggable = isDraggable || (() => false);
    this.onDragStart = onDragStart || (() => {});
    this.onDragUpdate = onDragUpdate || (() => {});
    this.onDragEnd = onDragEnd || (() => {});
    this.onCameraChange = onCameraChange || (() => {});
    this.pointers = new Map();
    this.dragMoved = false;
    this.draggingSquad = null; // {x,y} タイル座標(つかんだ位置)
    this.panning = false; // 盤面パン中かどうか(移動し続ける間ずっとtrueのまま)
    this.pendingPress = null; // 長押し判定待ちの押下(ドラッグ対象かどうかも保持しておく)
    this.longPressTimer = null;
    this.longPressFired = false;
    this.lastPinchDist = null;
    this.lastPinchAngle = null;
    this.lastMid = null;
    this.pinchAngleAtStart = null;
    this.pinchRotationActive = false;

    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    window.addEventListener('pointermove', this.onMove.bind(this));
    window.addEventListener('pointerup', this.onUp.bind(this));
    window.addEventListener('pointercancel', this.onUp.bind(this));
  }

  localPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onDown(e) {
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch (err) {
      // 一部の環境(合成イベント等)では有効なポインタが無く失敗することがあるが、
      // window側でmove/upを拾うため捕捉できなくても致命的ではない
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    this.dragMoved = false;

    if (this.pointers.size === 1) {
      const { x, y } = this.localPos(e);
      const tile = this.renderer.screenToBoard(x, y);
      // すぐにドラッグ/パンを始めず、動かずに一定時間経てば「長押し」として別扱いにする
      // (指を動かせば従来通りドラッグ or パンへ昇格する。長押し判定はドラッグ可否に関わらず常に行う)
      this.pendingPress = {
        tile,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        draggable: this.isDraggable(tile.x, tile.y),
      };
      this.longPressFired = false;
      clearTimeout(this.longPressTimer);
      this.longPressTimer = setTimeout(() => {
        if (this.pendingPress && !this.dragMoved) {
          this.longPressFired = true;
          const { tile } = this.pendingPress;
          this.pendingPress = null;
          this.onLongPress(tile.x, tile.y);
        }
      }, LONG_PRESS_MS);
      return;
    }
    if (this.pointers.size === 2) {
      this.pendingPress = null;
      if (this.panning) {
        this.panning = false;
        this.renderer.panEnd?.();
      }
      clearTimeout(this.longPressTimer);
      const [a, b] = [...this.pointers.values()];
      this.lastPinchDist = dist(a, b);
      this.lastPinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.pinchAngleAtStart = this.lastPinchAngle;
      this.pinchRotationActive = false;
      this.lastMid = mid(a, b);
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.draggingSquad) {
      const { x, y } = this.localPos(e);
      const tile = this.renderer.screenToBoard(x, y);
      this.dragMoved = true;
      this.onDragUpdate(x, y, tile.x, tile.y);
      return;
    }

    if (this.panning && this.pointers.size === 1) {
      // 指が動き続ける限り、毎回のmoveイベントで継続してパンし続ける(1:1で追従させる)
      const { x, y } = this.localPos(e);
      this.renderer.panScreen(x, y);
      this.onCameraChange();
      return;
    }

    if (this.pendingPress && this.pointers.size === 1 && this.pendingPress.pointerId === e.pointerId) {
      const dx = e.clientX - this.pendingPress.startX;
      const dy = e.clientY - this.pendingPress.startY;
      if (Math.abs(dx) + Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
        clearTimeout(this.longPressTimer);
        const { tile, draggable, startX, startY } = this.pendingPress;
        this.pendingPress = null;
        this.dragMoved = true;
        if (draggable) {
          this.draggingSquad = { x: tile.x, y: tile.y };
          this.onDragStart(tile.x, tile.y);
          const { x, y } = this.localPos(e);
          const nowTile = this.renderer.screenToBoard(x, y);
          this.onDragUpdate(x, y, nowTile.x, nowTile.y);
        } else {
          // ドラッグ対象でなければ、従来通り盤面パンとして扱う(押下開始位置を起点に1:1で追従)
          this.panning = true;
          const rect = this.canvas.getBoundingClientRect();
          this.renderer.panScreen(startX - rect.left, startY - rect.top);
          const { x, y } = this.localPos(e);
          this.renderer.panScreen(x, y);
          this.onCameraChange();
        }
      }
      return;
    }

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = dist(a, b);
      const m = mid(a, b);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.lastPinchDist) {
        const scaleDelta = d / this.lastPinchDist;
        this.applyZoom(scaleDelta, m);
        if (this.lastPinchAngle != null) {
          // ジェスチャー開始角度からの累積回転が遊びを超えるまでは回転を適用しない
          // (ズームだけのつもりで指がわずかにブレても回転しないようにする)
          if (!this.pinchRotationActive) {
            const cumulativeDeg = Math.abs(angleDiff(ang, this.pinchAngleAtStart)) * (180 / Math.PI);
            if (cumulativeDeg > PINCH_ROTATE_DEADZONE_DEG) this.pinchRotationActive = true;
          }
          if (this.pinchRotationActive) {
            this.renderer.rotateBy(angleDiff(ang, this.lastPinchAngle));
          }
        }
        this.onCameraChange();
      }
      this.lastPinchDist = d;
      this.lastPinchAngle = ang;
      this.lastMid = m;
      this.dragMoved = true;
    }
  }

  applyZoom(scaleDelta, screenMid) {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.zoomAt(scaleDelta, screenMid.x - rect.left, screenMid.y - rect.top);
  }

  onUp(e) {
    if (this.draggingSquad) {
      const { x, y } = this.localPos(e);
      const tile = this.renderer.screenToBoard(x, y);
      const moved = this.dragMoved;
      this.draggingSquad = null;
      this.onDragEnd(tile.x, tile.y, moved);
      this.pointers.delete(e.pointerId);
      return;
    }

    if (this.panning) {
      this.panning = false;
      this.renderer.panEnd?.();
    }

    clearTimeout(this.longPressTimer);
    this.pendingPress = null;

    const p = this.pointers.get(e.pointerId);
    if (p && !this.dragMoved && !this.longPressFired && this.pointers.size <= 1) {
      const { x, y } = this.localPos(e);
      const tile = this.renderer.screenToBoard(x, y);
      this.onTap(tile.x, tile.y);
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = null;
      this.lastPinchAngle = null;
    }
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
// 2つの角度(ラジアン)の差を、±πをまたぐ場合も正しく最短方向で返す
function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
