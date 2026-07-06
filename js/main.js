import { MODES, getMode } from './core/modes.js';
import { canSplit, canMerge } from './core/squad.js';
import { isAdjacent } from './core/board.js';
import { TERRAIN } from './core/terrain.js';
import { MIN_ACTIVE_SOLDIERS, MAX_SQUAD_SIZE, UNIT_TYPES, PREMIUM_CARD_DEFS, GENERAL_UPGRADE_TYPES, UNIT_STATS } from './core/units.js';
import { loadProfile, saveProfile, checkLoginBonus, spendGems } from './core/profile.js';
import {
  createGame,
  emptyDeployTiles,
  isDeployTile,
  placeSquad,
  returnSquadToQueue,
  autoDeployRemaining,
  startBattle,
  getReachable,
  getMeleeTargets,
  getArcherTargets,
  moveSquad,
  meleeAttack,
  rangedAttack,
  splitSquad,
  mergeSquads,
  playCard,
  playableCards,
  endTurn,
  surrender,
  other,
} from './core/rules.js';
import { cpuStepTurn } from './core/ai.js';
import { STORY_NATIONS, resolveStoryPosition, totalStoryTerritories } from './core/story.js';
import { createStoryGame, applyStoryVictory } from './core/storyBattle.js';
import { Renderer3D as Renderer } from './ui/render3d.js';
import { InputController } from './ui/input.js';
import { NetClient } from './net/client.js';

const $ = (id) => document.getElementById(id);

const splashScreen = $('splash-screen');
const menuScreen = $('menu-screen');
const gameScreen = $('game-screen');
const installBtn = $('install-btn');
const modeList = $('mode-list');
const turnIndicator = $('turn-indicator');
const canvas = $('board-canvas');
const canvasWrap = $('canvas-wrap');
const squadInfoEl = $('squad-info');
const deployPanel = $('deploy-panel');
const battlePanel = $('battle-panel');
const deployList = $('deploy-list');
const cardHand = $('card-hand');
const splitBtn = $('split-btn');
const shootBtn = $('shoot-btn');
const cardBtn = $('card-btn');
const cancelBtn = $('cancel-btn');
const combatModal = $('combat-modal');
const combatBody = $('combat-body');
const combatTitle = $('combat-title');
const resultModal = $('result-modal');
const resultTitle = $('result-title');
const resultDesc = $('result-desc');
const logDrawer = $('log-drawer');
const logList = $('log-list');
const splitModal = $('split-modal');
const splitSlider = $('split-slider');
const splitALabel = $('split-a-label');
const splitBLabel = $('split-b-label');
const rulesModal = $('rules-modal');
const confirmModal = $('confirm-modal');
const confirmMessage = $('confirm-message');
const confirmYesBtn = $('confirm-yes-btn');
const confirmNoBtn = $('confirm-no-btn');
const gemCountEl = $('gem-count');
const shopBtn = $('shop-btn');
const shopModal = $('shop-modal');
const shopGemCountEl = $('shop-gem-count');
const cardGachaBtn = $('card-gacha-btn');
const generalGachaBtn = $('general-gacha-btn');
const cardOwnedList = $('card-owned-list');
const generalOwnedList = $('general-owned-list');
const gachaResultModal = $('gacha-result-modal');
const gachaResultBody = $('gacha-result-body');
const loginBonusModal = $('login-bonus-modal');
const loginBonusText = $('login-bonus-text');
const onlineBtn = $('online-btn');
const onlineModal = $('online-modal');
const onlineCloseBtn = $('online-close-btn');
const onlineSetupView = $('online-setup-view');
const onlineWaitingView = $('online-waiting-view');
const onlineModeList = $('online-mode-list');
const onlineAutoMatchBtn = $('online-auto-match-btn');
const onlineCodeInput = $('online-code-input');
const onlineCodeBtn = $('online-code-btn');
const onlineCancelBtn = $('online-cancel-btn');
const onlineErrorText = $('online-error-text');
const peerLeftModal = $('peer-left-modal');
const peerLeftCloseBtn = $('peer-left-close-btn');
const turnorderModal = $('turnorder-modal');
const turnorderChipA = $('turnorder-a');
const turnorderChipB = $('turnorder-b');
const turnorderResult = $('turnorder-result');
const storyBtn = $('story-btn');
const storyModal = $('story-modal');
const storyNationList = $('story-nation-list');
const storyCloseBtn = $('story-close-btn');
const storyReserveEl = $('story-reserve');

const CARD_GACHA_COST = 150;
const GENERAL_GACHA_COST = 200;

let profile = loadProfile();

function showConfirm(message, onYes) {
  confirmMessage.textContent = message;
  confirmModal.hidden = false;
  const cleanup = () => {
    confirmModal.hidden = true;
    confirmYesBtn.removeEventListener('click', onYesClick);
    confirmNoBtn.removeEventListener('click', onNoClick);
  };
  const onYesClick = () => {
    cleanup();
    onYes();
  };
  const onNoClick = () => cleanup();
  confirmYesBtn.addEventListener('click', onYesClick);
  confirmNoBtn.addEventListener('click', onNoClick);
}

let game = null;
let renderer = null;
let input = null;
let selectedDeployIndex = null;
let selection = null; // { squad, reachable, meleeTargets, archerTargets, pendingAction }
let dragGhost = null; // { squad, sx, sy }
let hoverTile = null; // { x, y }
let hoverValid = false;
let renderLoopQueued = false;
let deployBoardDrag = null; // 配置フェーズで既に置いた部隊をつかんでいる時の対象

// ---------- オンライン対戦(カジュアル) ----------
// このアプリは静的PWAなのでゲームルールは常に自分のブラウザで実行する。
// オンライン対戦時は「自分のプレイヤーID」を myId として扱い(ホストがA、ゲストがB)、
// 中継サーバー経由で送られてきた確定済みのアクション/状態を、そのまま同じルール関数に
// 適用することで両者の盤面を一致させるロックステップ方式を取る。
// 公開トンネル(Cloudflare Quick Tunnel)経由でアクセスされている場合は、中継サーバー用に
// 別途用意したトンネルの固定ホスト名を使う(ポート違いの同一ホストという前提が崩れるため)。
// 同一Wi-Fi/ローカルアクセス時は従来通りlocation.hostnameから自動導出する。
const PUBLIC_RELAY_TUNNEL_HOST = 'wesley-surplus-amendments-groundwater.trycloudflare.com';
const RELAY_SERVER_URL = location.hostname.endsWith('trycloudflare.com')
  ? `wss://${PUBLIC_RELAY_TUNNEL_HOST}`
  : `ws://${location.hostname}:8790`;
let myId = 'A';
let netClient = null;
let isOnlineGame = false;
let isHost = false;
let onlineSelectedMode = 'easy';
let deployReady = { A: false, B: false };
let combatModalFromPeer = false;

// ---------- 画面遷移 ----------
function showScreen(name) {
  menuScreen.hidden = name !== 'menu';
  gameScreen.hidden = name !== 'game';
}

function buildMenu() {
  modeList.innerHTML = '';
  for (const mode of Object.values(MODES)) {
    const btn = document.createElement('button');
    btn.className = `mode-card ${mode.id}`;
    btn.innerHTML = `<b>${mode.name}</b><span>${mode.desc}</span>`;
    btn.addEventListener('click', () => startGame(mode.id));
    modeList.appendChild(btn);
  }
}

function startGame(modeId) {
  isOnlineGame = false;
  isHost = false;
  myId = 'A';
  game = createGame(getMode(modeId), profile);
  enterGameScreen();
}

function startOnlineGameAsHost(modeId) {
  game = createGame(getMode(modeId), profile);
  game.players.A.name = 'プレイヤー1';
  game.players.B.name = 'プレイヤー2';
  enterGameScreen();
  netClient.sendGameMessage({ kind: 'init', state: game });
}

function startOnlineGameAsGuest(state) {
  game = state;
  enterGameScreen();
}

// ---------- ストーリーモード(『黎明の大地』国盗り合戦) ----------
function startStoryBattle() {
  const pos = resolveStoryPosition(profile.storyProgress);
  if (!pos) return; // 全国家制圧済み
  isOnlineGame = false;
  isHost = false;
  myId = 'A';
  game = createStoryGame(pos.nation, profile);
  enterGameScreen();
}

function buildStoryModal() {
  storyNationList.innerHTML = '';
  const pos = resolveStoryPosition(profile.storyProgress);
  let clearedTerritories = profile.storyProgress;
  STORY_NATIONS.forEach((nation) => {
    const nationCleared = clearedTerritories >= nation.territories;
    const isCurrent = pos && pos.nation.id === nation.id;
    const locked = !nationCleared && !isCurrent;
    const card = document.createElement('button');
    card.className = 'story-nation-card' + (nationCleared ? ' cleared' : isCurrent ? ' current' : ' locked');
    card.disabled = locked;
    const status = nationCleared ? '✅' : isCurrent ? '⚔️' : '🔒';
    const progressNote = nation.territories > 1
      ? `<span>領土 ${nationCleared ? nation.territories : (isCurrent ? pos.territoryIndex : 0)}/${nation.territories}</span>`
      : '';
    card.innerHTML = `
      <div class="flag" style="background:${nation.color}"></div>
      <div class="info"><b>${nation.name}(${nation.monarch})</b><span>${nation.desc}</span>${progressNote}</div>
      <div class="status">${status}</div>
    `;
    if (isCurrent) {
      card.addEventListener('click', () => {
        storyModal.hidden = true;
        startStoryBattle();
      });
    }
    storyNationList.appendChild(card);
    clearedTerritories -= nation.territories;
  });
  const reserve = profile.storyReserve;
  storyReserveEl.textContent = `予備兵力: 歩兵${reserve.infantry || 0} / 弓兵${reserve.archer || 0} / 騎兵${reserve.cavalry || 0}`;
}

storyBtn.addEventListener('click', () => {
  buildStoryModal();
  storyModal.hidden = false;
});
storyCloseBtn.addEventListener('click', () => {
  storyModal.hidden = true;
});

function enterGameScreen() {
  selection = null;
  selectedDeployIndex = null;
  lastAnnouncedPlayer = null;
  deployHistory = [];
  battleHistory = [];
  tileInfo = null;
  deployReady = { A: false, B: false };
  showScreen('game');
  if (!renderer) {
    renderer = new Renderer(canvas);
    input = new InputController(canvas, renderer, {
      onTap: handleBoardTap,
      onLongPress: handleBoardLongPress,
      isDraggable: isDraggableAt,
      onDragStart,
      onDragUpdate,
      onDragEnd,
      onCameraChange: render,
    });
  }
  setTimeout(() => {
    renderer.resize();
    renderer.fitBoard(game.size);
    refreshDeployUI();
    render();
  }, 0);
}

window.addEventListener('resize', () => {
  if (!renderer || !game) return;
  renderer.resize();
  renderer.fitBoard(game.size);
  render();
});

// ---------- オンライン対戦: メニューUI ----------
function buildOnlineModeList() {
  onlineModeList.innerHTML = '';
  for (const mode of Object.values(MODES)) {
    const btn = document.createElement('button');
    btn.className = `mode-card ${mode.id}` + (mode.id === onlineSelectedMode ? ' selected' : '');
    btn.innerHTML = `<b>${mode.name}</b><span>${mode.desc}</span>`;
    btn.addEventListener('click', () => {
      onlineSelectedMode = mode.id;
      buildOnlineModeList();
    });
    onlineModeList.appendChild(btn);
  }
}

function showOnlineError(message) {
  onlineErrorText.textContent = message;
  onlineErrorText.hidden = false;
}

function resetOnlineModal() {
  onlineSetupView.hidden = false;
  onlineWaitingView.hidden = true;
  onlineErrorText.hidden = true;
  onlineCodeInput.value = '';
}

onlineBtn.addEventListener('click', () => {
  buildOnlineModeList();
  resetOnlineModal();
  onlineModal.hidden = false;
});

onlineCloseBtn.addEventListener('click', () => {
  if (netClient && !onlineWaitingView.hidden) netClient.cancel();
  onlineModal.hidden = true;
});

onlineCancelBtn.addEventListener('click', () => {
  netClient?.cancel();
  resetOnlineModal();
});

function ensureNetClient() {
  if (netClient) return Promise.resolve(netClient);
  netClient = new NetClient(RELAY_SERVER_URL);
  netClient.onWaiting = () => {
    onlineSetupView.hidden = true;
    onlineWaitingView.hidden = false;
  };
  netClient.onMatched = (msg) => {
    onlineModal.hidden = true;
    isOnlineGame = true;
    isHost = msg.role === 'host';
    myId = msg.role === 'host' ? 'A' : 'B';
    if (msg.role === 'host') {
      startOnlineGameAsHost(msg.mode);
    }
    // ゲスト側はホストから送られてくる init アクションの到着を待つ(下のonAction参照)
  };
  netClient.onGameMessage = (data) => {
    if (data.kind === 'init') startOnlineGameAsGuest(data.state);
    else if (data.kind === 'deployUpdate') applyDeployUpdate(data);
    else if (data.kind === 'state') applyIncomingState(data.state);
  };
  netClient.onPeerLeft = () => {
    if (!isOnlineGame) return;
    peerLeftModal.hidden = false;
  };
  netClient.onDisconnected = () => {
    if (!isOnlineGame) return;
    peerLeftModal.hidden = false;
  };
  return netClient.connect().then(() => netClient);
}

onlineAutoMatchBtn.addEventListener('click', () => {
  onlineErrorText.hidden = true;
  ensureNetClient()
    .then((client) => client.queueCasual(onlineSelectedMode))
    .catch(() => showOnlineError('サーバーに接続できませんでした'));
});

onlineCodeBtn.addEventListener('click', () => {
  const code = onlineCodeInput.value.trim();
  if (!code) return showOnlineError('合言葉を入力してください');
  onlineErrorText.hidden = true;
  ensureNetClient()
    .then((client) => client.joinRoom(onlineSelectedMode, code))
    .catch(() => showOnlineError('サーバーに接続できませんでした'));
});

peerLeftCloseBtn.addEventListener('click', () => {
  peerLeftModal.hidden = true;
  leaveOnlineGame();
  showScreen('menu');
});

// ---------- 描画 ----------
function render() {
  if (!game || !renderer) return;
  const view = { viewerId: myId };
  if (game.phase === 'deploy') {
    view.deployTiles = emptyDeployTiles(game, myId);
  }
  if (selection) {
    view.selected = selection.squad;
    view.selectedGroup = selection.group;
    view.reachable = selection.reachable;
    view.meleeTargets = selection.meleeTargets;
    view.archerTargets = selection.archerTargets;
  }
  if (dragGhost) view.dragGhost = dragGhost;
  if (hoverTile) {
    view.hoverTile = hoverTile;
    view.hoverValid = hoverValid;
  }
  renderer.draw(game, view);
  if (renderer.hasActiveAnimations() && !renderLoopQueued) {
    renderLoopQueued = true;
    requestAnimationFrame(() => {
      renderLoopQueued = false;
      render();
    });
  }
}

// ---------- 配置フェーズ ----------
function refreshDeployUI() {
  deployPanel.hidden = game.phase !== 'deploy';
  battlePanel.hidden = game.phase === 'deploy';
  if (game.phase !== 'deploy') {
    refreshBattleUI();
    return;
  }
  turnIndicator.textContent = `配置フェーズ (残り ${game.deployQueue[myId].length})`;
  turnIndicator.className = 'turn-indicator';
  deployList.innerHTML = '';
  game.deployQueue[myId].forEach((squad, idx) => {
    const chip = document.createElement('div');
    chip.className = 'deploy-chip' + (squad.isGeneral ? ' general' : squad.isViceGeneral ? ' vice-general' : '') + (idx === selectedDeployIndex ? ' selected' : '');
    let icon = squad.stats.icon;
    let label = squad.stats.label;
    if (squad.isGeneral) {
      icon = `👑${squad.stats.icon}`;
      label = `大将(${squad.stats.label})`;
    } else if (squad.isViceGeneral) {
      icon = `🎖️${squad.stats.icon}`;
      label = `副将(${squad.stats.label})`;
    }
    chip.innerHTML = `<span class="icon">${icon}</span><span>${label}</span><span class="count">${squad.count}人</span>`;
    chip.addEventListener('pointerdown', (e) => onDeployChipPointerDown(idx, e));
    deployList.appendChild(chip);
  });
  if (selectedDeployIndex >= game.deployQueue[myId].length) selectedDeployIndex = null;
  $('deploy-undo-btn').disabled = deployHistory.length === 0;
}

// ---------- 配置のやり直し(1つ戻る) ----------
let deployHistory = [];

function pushDeployHistory() {
  deployHistory.push({
    squads: game.squads.filter((s) => s.ownerId === myId).map((s) => ({ ...s })),
    otherSquads: game.squads.filter((s) => s.ownerId !== myId),
    queue: game.deployQueue[myId].map((t) => ({ ...t })),
  });
  if (deployHistory.length > 50) deployHistory.shift();
}

function isDeployLocked() {
  return isOnlineGame && deployReady[myId];
}

$('deploy-undo-btn').addEventListener('click', () => {
  if (isDeployLocked()) return;
  const prev = deployHistory.pop();
  if (!prev) return;
  game.squads = [...prev.otherSquads, ...prev.squads];
  game.deployQueue[myId] = prev.queue;
  selectedDeployIndex = null;
  syncDeployState();
  refreshDeployUI();
  render();
});

// ---------- 配置フェーズのドラッグ&ドロップ(駒をつかんでそのまま盤面に置く) ----------
let deployDrag = null; // { templateIndex, icon, label, startX, startY, moved }
const deployGhostEl = $('deploy-drag-ghost');

function onDeployChipPointerDown(idx, e) {
  if (isDeployLocked()) return;
  const squad = game.deployQueue[myId][idx];
  if (!squad) return;
  deployDrag = {
    templateIndex: idx,
    icon: squad.isGeneral ? `👑${squad.stats.icon}` : squad.isViceGeneral ? `🎖️${squad.stats.icon}` : squad.stats.icon,
    label: squad.isGeneral ? `大将(${squad.stats.label})` : squad.isViceGeneral ? `副将(${squad.stats.label})` : squad.stats.label,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
  };
}

function updateDeployHover(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
    hoverTile = null;
    render();
    return;
  }
  const tile = renderer.screenToBoard(localX, localY);
  hoverTile = { x: tile.x, y: tile.y };
  hoverValid = emptyDeployTiles(game, myId).some((t) => t.x === tile.x && t.y === tile.y);
  render();
}

window.addEventListener('pointermove', (e) => {
  if (!deployDrag) return;
  const dx = e.clientX - deployDrag.startX;
  const dy = e.clientY - deployDrag.startY;
  if (!deployDrag.moved && Math.abs(dx) + Math.abs(dy) > 6) {
    deployDrag.moved = true;
    deployGhostEl.innerHTML = `<span class="icon">${deployDrag.icon}</span><span>${deployDrag.label}</span>`;
    deployGhostEl.hidden = false;
  }
  if (deployDrag.moved) {
    deployGhostEl.style.left = `${e.clientX}px`;
    deployGhostEl.style.top = `${e.clientY}px`;
    updateDeployHover(e.clientX, e.clientY);
  }
});

window.addEventListener('pointerup', (e) => {
  if (!deployDrag) return;
  const { templateIndex, moved } = deployDrag;
  deployGhostEl.hidden = true;
  hoverTile = null;
  deployDrag = null;

  if (moved) {
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (localX >= 0 && localY >= 0 && localX <= rect.width && localY <= rect.height) {
      const tile = renderer.screenToBoard(localX, localY);
      tryPlaceFromQueue(templateIndex, tile.x, tile.y);
      return;
    }
  } else {
    selectedDeployIndex = templateIndex;
  }
  refreshDeployUI();
  render();
});

$('auto-deploy-btn').addEventListener('click', () => {
  if (isDeployLocked()) return;
  pushDeployHistory();
  autoDeployRemaining(game, myId);
  selectedDeployIndex = null;
  syncDeployState();
  refreshDeployUI();
  render();
});

$('finish-deploy-btn').addEventListener('click', () => {
  if (game.deployQueue[myId].length > 0) {
    autoDeployRemaining(game, myId);
  }
  if (isOnlineGame) {
    deployReady[myId] = true;
    selectedDeployIndex = null;
    syncDeployState();
    refreshDeployUI();
    render();
    maybeStartOnlineBattle();
    return;
  }
  autoDeployRemaining(game, other(myId));
  const firstPlayer = Math.random() < 0.5 ? 'A' : 'B';
  startBattle(game, firstPlayer);
  selectedDeployIndex = null;
  showTurnOrderRoulette(firstPlayer, afterPlayerAction);
});

// ---------- オンライン対戦: 配置フェーズの同期 ----------
function syncDeployState() {
  if (!isOnlineGame || !netClient) return;
  netClient.sendGameMessage({
    kind: 'deployUpdate',
    playerId: myId,
    squads: game.squads.filter((s) => s.ownerId === myId).map((s) => ({ ...s })),
    deployQueue: game.deployQueue[myId].map((t) => ({ ...t })),
    ready: deployReady[myId],
  });
}

function applyDeployUpdate(msg) {
  const peerId = msg.playerId;
  game.squads = game.squads.filter((s) => s.ownerId !== peerId).concat(msg.squads);
  game.deployQueue[peerId] = msg.deployQueue;
  deployReady[peerId] = msg.ready;
  refreshDeployUI();
  render();
  maybeStartOnlineBattle();
}

function maybeStartOnlineBattle() {
  if (game.phase === 'deploy' && deployReady.A && deployReady.B && isHost) {
    const firstPlayer = Math.random() < 0.5 ? 'A' : 'B';
    startBattle(game, firstPlayer);
    lastAnnouncedPlayer = null;
    broadcastState();
    showTurnOrderRoulette(firstPlayer, () => {
      refreshDeployUI();
      render();
    });
  }
}

// ---------- 先攻・後攻抽選ルーレット ----------
function showTurnOrderRoulette(firstPlayer, onDone) {
  const labelFor = (id) => (id === myId ? 'あなた' : isOnlineGame ? '相手' : 'CPU');
  turnorderChipA.textContent = labelFor('A');
  turnorderChipB.textContent = labelFor('B');
  turnorderChipA.className = 'turnorder-chip a spinning';
  turnorderChipB.className = 'turnorder-chip b spinning spin-delay';
  turnorderResult.textContent = '';
  turnorderModal.hidden = false;
  setTimeout(() => {
    const winnerChip = firstPlayer === 'A' ? turnorderChipA : turnorderChipB;
    const loserChip = firstPlayer === 'A' ? turnorderChipB : turnorderChipA;
    winnerChip.className = 'turnorder-chip ' + (firstPlayer === 'A' ? 'a' : 'b') + ' winner';
    loserChip.className = 'turnorder-chip ' + (firstPlayer === 'A' ? 'b' : 'a') + ' loser';
    turnorderResult.textContent = `${winnerChip.textContent}が先攻!`;
    vibrate([30, 40, 30]);
    setTimeout(() => {
      turnorderModal.hidden = true;
      onDone();
    }, 1100);
  }, 1400);
}

// ---------- 戦闘フェーズ ----------
let lastAnnouncedPlayer = null;

function refreshBattleUI() {
  const isPlayerTurn = game.currentPlayer === myId;
  const opponentLabel = isOnlineGame ? '相手' : 'CPU';
  turnIndicator.textContent = `${game.turnNumber}ターン目 - ${isPlayerTurn ? 'あなたの番' : opponentLabel + 'の番'}`;
  turnIndicator.className = 'turn-indicator ' + (isPlayerTurn ? 'player-a' : 'player-b');
  $('end-turn-btn').disabled = !isPlayerTurn;
  $('surrender-btn').disabled = !isPlayerTurn;
  updateActionButtons();
  updateSquadInfoPanel();
  updateLog();
  if (lastAnnouncedPlayer !== game.currentPlayer) {
    lastAnnouncedPlayer = game.currentPlayer;
    battleHistory = [];
    announceTurn(isPlayerTurn);
  }
  $('battle-undo-btn').disabled = !isPlayerTurn || battleHistory.length === 0;
}

// ---------- 自分のターン中の「1つ戻る」 ----------
let battleHistory = [];

function pushBattleHistory() {
  battleHistory.push({
    squads: game.squads.map((s) => ({ ...s, stats: { ...s.stats } })),
    handA: game.players.A.hand.map((c) => ({ ...c })),
    handB: game.players.B.hand.map((c) => ({ ...c })),
    turnNumber: game.turnNumber,
    phase: game.phase,
    winner: game.winner,
    lastCombat: game.lastCombat,
  });
  if (battleHistory.length > 30) battleHistory.shift();
}

$('battle-undo-btn').addEventListener('click', () => {
  const prev = battleHistory.pop();
  if (!prev) return;
  game.squads = prev.squads;
  game.players.A.hand = prev.handA;
  game.players.B.hand = prev.handB;
  game.turnNumber = prev.turnNumber;
  game.phase = prev.phase;
  game.winner = prev.winner;
  game.lastCombat = prev.lastCombat;
  renderer.animations.clear();
  selection = null;
  combatModal.hidden = true;
  resultModal.hidden = true;
  if (isOnlineGame) broadcastState();
  refreshDeployUI();
  render();
});

function announceTurn(isPlayerTurn) {
  const banner = $('turn-banner');
  const opponentLabel = isOnlineGame ? '相手' : 'CPU';
  banner.textContent = isPlayerTurn ? 'あなたのターン' : opponentLabel + 'のターン';
  banner.className = 'turn-banner show ' + (isPlayerTurn ? 'player-a' : 'player-b');
  clearTimeout(announceTurn._timer);
  announceTurn._timer = setTimeout(() => {
    banner.className = 'turn-banner ' + (isPlayerTurn ? 'player-a' : 'player-b');
  }, 1400);
}

$('rotate-left-btn').addEventListener('click', () => {
  if (!renderer) return;
  renderer.rotateCCW();
  render();
});
$('rotate-right-btn').addEventListener('click', () => {
  if (!renderer) return;
  renderer.rotateCW();
  render();
});
$('zoom-in-btn').addEventListener('click', () => {
  if (!renderer) return;
  const rect = canvasWrap.getBoundingClientRect();
  renderer.zoomAt(1.25, rect.width / 2, rect.height / 2);
  render();
});
$('zoom-out-btn').addEventListener('click', () => {
  if (!renderer) return;
  const rect = canvasWrap.getBoundingClientRect();
  renderer.zoomAt(0.8, rect.width / 2, rect.height / 2);
  render();
});
$('tilt-up-btn').addEventListener('click', () => {
  if (!renderer) return;
  renderer.tiltBy(0.15);
  render();
});
$('tilt-down-btn').addEventListener('click', () => {
  if (!renderer) return;
  renderer.tiltBy(-0.15);
  render();
});

function updateActionButtons() {
  const isGrouped = selection && selection.group.length > 1;
  const canSelectAct = selection && !isGrouped && selection.squad.ownerId === myId && !selection.squad.actedThisTurn && game.currentPlayer === myId;
  splitBtn.disabled = !canSelectAct || !canSplit(selection?.squad, Math.floor((selection?.squad.count || 0) / 2));
  const canShoot = canSelectAct && selection.squad.type === UNIT_TYPES.ARCHER && selection.archerTargets.length > 0;
  shootBtn.disabled = !canShoot;
  const cards = canSelectAct ? playableCards(game, myId, selection.squad) : [];
  cardBtn.disabled = !canSelectAct || cards.length === 0;
  cancelBtn.disabled = !selection;
  renderCardHand(cards);
}

function renderCardHand(cards) {
  cardHand.innerHTML = '';
  cardHand.classList.remove('open');
  for (const card of cards) {
    const chip = document.createElement('div');
    chip.className = 'card-chip';
    chip.innerHTML = `<b>${card.name}</b>${card.desc}`;
    chip.addEventListener('click', () => {
      pushBattleHistory();
      playCard(game, myId, selection.squad, card.uid);
      const stillSelected = game.squads.find((s) => s.id === selection.squad.id);
      if (stillSelected && !stillSelected.actedThisTurn) {
        selectSquad(stillSelected);
      } else {
        clearSelection();
      }
      afterPlayerAction();
    });
    cardHand.appendChild(chip);
  }
}

cardBtn.addEventListener('click', () => cardHand.classList.toggle('open'));

// ---------- マスの説明 ----------
const TERRAIN_INFO = {
  [TERRAIN.PLAIN]: { label: '平地', icon: '🌿', desc: '移動コスト1。特別な効果はありません。' },
  [TERRAIN.ROAD]: { label: '道', icon: '🛤️', desc: '移動コスト0.5。素早く移動できます。' },
  [TERRAIN.FOREST]: { label: '林', icon: '🌲', desc: '移動コスト1。ここにいる部隊は敵から種類が見えません(???表示)。林から攻撃すると奇襲+2(部隊ごとに生涯1回)。' },
  [TERRAIN.HILL]: { label: '丘', icon: '⛰️', desc: '移動コスト1。防御側の地形防御+1。' },
  [TERRAIN.MOUNTAIN]: { label: '山', icon: '🗻', desc: '移動コスト2。防御側の地形防御+2。' },
  [TERRAIN.WATER]: { label: '水', icon: '🌊', desc: '通行不可。部隊はここを移動できません。' },
};

let tileInfo = null; // { x, y }

function showTileInfo(x, y) {
  tileInfo = { x, y };
  updateSquadInfoPanel();
}

function clearTileInfo() {
  tileInfo = null;
}

function updateSquadInfoPanel() {
  if (selection) {
    const s = selection.squad;
    squadInfoEl.hidden = false;
    let rankPrefix = '';
    if (s.isGeneral) rankPrefix = `👑 ${s.isEliteGeneral ? '名将' : '大将'} `;
    else if (s.isViceGeneral) rankPrefix = '🎖️ 副将 ';
    const groupNote = selection.group.length > 1 ? `<div class="hint">他${selection.group.length - 1}部隊とまとめて移動中</div>` : '';
    squadInfoEl.innerHTML = `
      <b>${rankPrefix}${s.stats.icon} ${s.stats.label}${s.ownerId !== myId ? '(敵)' : ''}</b>
      <div class="stat-row"><span>兵数</span><span>${s.count}</span></div>
      <div class="stat-row"><span>ランク</span><span>${s.stats.rank}</span></div>
      <div class="stat-row"><span>移動力</span><span>${s.stats.move + (s.tempMoveBonus || 0)}</span></div>
      <div class="stat-row"><span>疲労</span><span>${s.fatigue}</span></div>
      ${groupNote}
    `;
    return;
  }
  if (tileInfo && game && game.grid) {
    const terrain = game.grid[tileInfo.y][tileInfo.x].terrain;
    const info = TERRAIN_INFO[terrain];
    squadInfoEl.hidden = false;
    squadInfoEl.innerHTML = `
      <b>${info.icon} ${info.label}</b>
      <div class="hint">${info.desc}</div>
    `;
    return;
  }
  squadInfoEl.hidden = true;
}

function updateLog() {
  logList.innerHTML = game.log
    .slice(-200)
    .map((l) => `<div>${l}</div>`)
    .join('');
  logList.scrollTop = logList.scrollHeight;
}

// ---------- 選択・行動 ----------
function selectSquad(squad) {
  clearTileInfo();
  selection = {
    squad,
    group: [squad],
    reachable: getReachable(game, squad),
    meleeTargets: getMeleeTargets(game, squad),
    archerTargets: squad.stats.range > 1 ? getArcherTargets(game, squad) : [],
  };
  refreshBattleUI();
  render();
}

// 長押しで同じ兵種の別部隊を選択に追加する(まとめて同じ方向・同じ距離だけ移動させるため)
function addToSelectionGroup(squad) {
  if (!selection || selection.squad.type !== squad.type) return;
  if (selection.group.some((s) => s.id === squad.id)) return;
  selection.group.push(squad);
  flashBanner(`${selection.group.length}部隊を選択中(まとめて移動できます)`);
  updateActionButtons();
  render();
}

function flashBanner(text) {
  const banner = $('turn-banner');
  banner.textContent = text;
  banner.className = 'turn-banner show';
  clearTimeout(flashBanner._t);
  flashBanner._t = setTimeout(() => {
    banner.className = 'turn-banner';
  }, 1400);
}

function clearSelection() {
  selection = null;
  refreshBattleUI();
  render();
}

cancelBtn.addEventListener('click', clearSelection);

function findSquadAt(x, y) {
  return game.squads.find((s) => s.alive && s.x === x && s.y === y) || null;
}

// ---------- ドラッグ&ドロップ ----------
function isDraggableAt(x, y) {
  if (!game) return false;
  if (game.phase === 'deploy') {
    if (isDeployLocked()) return false;
    const s = findSquadAt(x, y);
    return !!(s && s.ownerId === myId);
  }
  if (game.phase !== 'battle' || game.currentPlayer !== myId) return false;
  if (selection && selection.group.length > 1) return false; // 複数部隊選択中はタップでの移動指示に統一する
  const s = findSquadAt(x, y);
  if (!s || s.ownerId !== myId || s.actedThisTurn) return false;
  // 既に選択中の部隊がある状態でその統合先(同兵種の味方)をタップした場合は、
  // ここで選択を奪わずに通常のタップ処理へ流し、統合が成立するようにする
  if (selection && selection.squad.id !== s.id && canMerge(selection.squad, s)) {
    const canReachAdjacent =
      isAdjacent(selection.squad.x, selection.squad.y, s.x, s.y) ||
      !!findAdjacentReachableTile(selection.squad, s, selection.reachable);
    if (canReachAdjacent) return false;
  }
  return true;
}

let dragStartWasAlreadySelected = false;

function onDragStart(x, y) {
  if (game.phase === 'deploy') {
    const s = findSquadAt(x, y);
    if (s) deployBoardDrag = s;
    return;
  }
  const s = findSquadAt(x, y);
  if (!s) return;
  dragStartWasAlreadySelected = !!(selection && selection.squad.id === s.id);
  selectSquad(s);
}

function isDeployDropValid(tx, ty) {
  return tx >= 0 && ty >= 0 && tx < game.size && ty < game.size && !findSquadAt(tx, ty) && isDeployTile(game, myId, tx, ty);
}

function onDragUpdate(sx, sy, tx, ty) {
  if (game.phase === 'deploy') {
    if (!deployBoardDrag) return;
    dragGhost = { squad: deployBoardDrag, sx, sy };
    hoverTile = { x: tx, y: ty };
    hoverValid = isDeployDropValid(tx, ty);
    render();
    return;
  }
  if (!selection) return;
  dragGhost = { squad: selection.squad, sx, sy };
  hoverTile = { x: tx, y: ty };
  hoverValid = isValidDropTile(tx, ty);
  render();
}

let dragJustEnded = false;

function onDragEnd(tx, ty, moved) {
  dragGhost = null;
  hoverTile = null;
  if (game.phase === 'deploy') {
    finishDeployBoardDrag(tx, ty);
    return;
  }
  if (!moved) {
    // 動かさずに離した = ただのタップ。すでに選択済みだった駒を再タップした時だけ選択解除する
    if (dragStartWasAlreadySelected) clearSelection();
    else render();
    return;
  }
  dragJustEnded = true;
  handleBoardTap(tx, ty);
  dragJustEnded = false;
}

function finishDeployBoardDrag(tx, ty) {
  const squad = deployBoardDrag;
  deployBoardDrag = null;
  if (!squad) return;
  if (tx === squad.x && ty === squad.y) {
    render();
    return;
  }
  pushDeployHistory();
  if (isDeployDropValid(tx, ty)) {
    squad.x = tx;
    squad.y = ty;
  } else {
    returnSquadToQueue(game, myId, squad.id);
    selectedDeployIndex = null;
  }
  syncDeployState();
  refreshDeployUI();
  render();
}

function isValidDropTile(tx, ty) {
  if (!selection) return false;
  const sq = selection.squad;
  if (tx === sq.x && ty === sq.y) return true;
  if (selection.reachable.has(`${tx},${ty}`)) return true;
  if (selection.meleeTargets.some((m) => m.target.x === tx && m.target.y === ty)) return true;
  if (selection.archerTargets.some((a) => a.target.x === tx && a.target.y === ty)) return true;
  const target = findSquadAt(tx, ty);
  if (target && canMerge(sq, target)) {
    if (isAdjacent(sq.x, sq.y, target.x, target.y)) return true;
    if (findAdjacentReachableTile(sq, target, selection.reachable)) return true;
  }
  return false;
}

// 統合先(同兵種の味方)に隣接する、今のターンで移動できるマスを探す
function findAdjacentReachableTile(sq, target, reachable) {
  const allowDiagonal = sq.type === UNIT_TYPES.CAVALRY;
  const deltas = allowDiagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of deltas) {
    const tx = target.x + dx;
    const ty = target.y + dy;
    if (reachable.has(`${tx},${ty}`)) return { x: tx, y: ty };
  }
  return null;
}

// 長押しで、同じ兵種の別部隊を現在の選択に追加する(まとめて同じ方向に移動させるため)
function handleBoardLongPress(x, y) {
  if (!game || game.phase !== 'battle' || game.currentPlayer !== myId) return;
  const squad = findSquadAt(x, y);
  if (!squad || squad.ownerId !== myId || squad.actedThisTurn) return;
  if (!selection) {
    selectSquad(squad);
    return;
  }
  if (squad.id === selection.squad.id) return;
  addToSelectionGroup(squad);
}

function handleBoardTap(x, y) {
  if (!game || x < 0 || y < 0 || x >= game.size || y >= game.size) return;
  if (game.phase === 'deploy') return handleDeployTap(x, y);
  if (game.phase !== 'battle' || game.currentPlayer !== myId) return;

  if (selection?.pendingAction === 'split-dest') {
    tryFinishSplit(x, y);
    return;
  }
  if (selection?.pendingAction === 'shoot') {
    tryFinishShoot(x, y);
    return;
  }

  const tapped = findSquadAt(x, y);

  if (selection) {
    const sq = selection.squad;
    if (tapped && tapped.id === sq.id) {
      clearSelection();
      return;
    }
    // 同じ兵種の味方の所にくっつけると、そのまま統合される(隣接していなければ届く所まで移動してから統合)
    if (tapped && tapped.ownerId === myId && canMerge(sq, tapped)) {
      if (isAdjacent(sq.x, sq.y, tapped.x, tapped.y)) {
        pushBattleHistory();
        mergeSquads(game, sq, tapped);
        afterPlayerAction();
        return;
      }
      const adjTile = findAdjacentReachableTile(sq, tapped, selection.reachable);
      if (adjTile) {
        pushBattleHistory();
        const fromX = sq.x, fromY = sq.y;
        sq.x = adjTile.x;
        sq.y = adjTile.y;
        if (!dragJustEnded) renderer.animateMove(game, sq, fromX, fromY, sq.x, sq.y);
        mergeSquads(game, sq, tapped);
        afterPlayerAction();
        return;
      }
    }
    if (tapped && tapped.ownerId === myId && !tapped.actedThisTurn) {
      selectSquad(tapped);
      return;
    }
    if (tapped && tapped.ownerId !== myId) {
      const melee = selection.meleeTargets.find((m) => m.target.id === tapped.id);
      if (melee) {
        pushBattleHistory();
        const fromX = sq.x, fromY = sq.y;
        meleeAttack(game, sq, melee.target, melee.from);
        if (sq.alive && !dragJustEnded) renderer.animateMove(game, sq, fromX, fromY, sq.x, sq.y);
        afterCombatAction();
        return;
      }
      const archer = selection.archerTargets.find((a) => a.target.id === tapped.id);
      if (archer) {
        pushBattleHistory();
        rangedAttack(game, sq, archer.target);
        afterCombatAction();
        return;
      }
      clearSelection();
      return;
    }
    if (!tapped && selection.reachable.has(`${x},${y}`)) {
      if (selection.group.length > 1) {
        tryGroupMove(x, y);
        return;
      }
      pushBattleHistory();
      const fromX = sq.x, fromY = sq.y;
      moveSquad(game, sq, x, y);
      if (!dragJustEnded) renderer.animateMove(game, sq, fromX, fromY, sq.x, sq.y);
      afterPlayerAction();
      return;
    }
    clearSelection();
    if (!tapped) showTileInfo(x, y);
    return;
  }

  if (tapped && tapped.ownerId === myId && !tapped.actedThisTurn) {
    selectSquad(tapped);
  } else if (!tapped) {
    showTileInfo(x, y);
  }
}

// 複数選択中の部隊を、リーダーが移動する方向・距離だけまとめてシフトさせる
function tryGroupMove(destX, destY) {
  const lead = selection.squad;
  const dx = destX - lead.x;
  const dy = destY - lead.y;
  const targets = [{ squad: lead, x: destX, y: destY }];
  for (const member of selection.group.slice(1)) {
    const mx = member.x + dx;
    const my = member.y + dy;
    if (mx < 0 || my < 0 || mx >= game.size || my >= game.size) {
      return flashBanner('一部の部隊がその方向へ進めません');
    }
    const memberReachable = getReachable(game, member);
    if (!memberReachable.has(`${mx},${my}`)) {
      return flashBanner('一部の部隊がその方向へ進めません');
    }
    targets.push({ squad: member, x: mx, y: my });
  }
  const seen = new Set();
  for (const t of targets) {
    const key = `${t.x},${t.y}`;
    if (seen.has(key)) return flashBanner('部隊同士がぶつかってしまいます');
    seen.add(key);
  }
  pushBattleHistory();
  for (const t of targets) {
    const fromX = t.squad.x, fromY = t.squad.y;
    moveSquad(game, t.squad, t.x, t.y);
    if (!dragJustEnded) renderer.animateMove(game, t.squad, fromX, fromY, t.squad.x, t.squad.y);
  }
  afterPlayerAction();
}

function handleDeployTap(x, y) {
  if (selectedDeployIndex == null) {
    if (!findSquadAt(x, y)) showTileInfo(x, y);
    return;
  }
  tryPlaceFromQueue(selectedDeployIndex, x, y);
}

// 500人上限の中で「何人置くか」を選べるようにする
let pendingDeployPlacement = null; // { templateIndex, x, y }
const deployAmountModal = $('deploy-amount-modal');
const deployAmountSlider = $('deploy-amount-slider');
const deployAmountLabel = $('deploy-amount-label');

function tryPlaceFromQueue(templateIndex, x, y) {
  if (isDeployLocked()) return;
  const template = game.deployQueue[myId][templateIndex];
  if (!template) return;
  if (!isDeployTile(game, myId, x, y) || findSquadAt(x, y)) {
    refreshDeployUI();
    render();
    return;
  }
  if (template.count <= MIN_ACTIVE_SOLDIERS) {
    pushDeployHistory();
    if (placeSquad(game, myId, templateIndex, x, y)) selectedDeployIndex = null;
    syncDeployState();
    refreshDeployUI();
    render();
    return;
  }
  pendingDeployPlacement = { templateIndex, x, y };
  const max = Math.min(template.count, MAX_SQUAD_SIZE);
  deployAmountSlider.min = MIN_ACTIVE_SOLDIERS;
  deployAmountSlider.max = max;
  deployAmountSlider.value = max;
  updateDeployAmountLabel();
  deployAmountModal.hidden = false;
}

function updateDeployAmountLabel() {
  deployAmountLabel.textContent = `${deployAmountSlider.value}人`;
}
deployAmountSlider.addEventListener('input', updateDeployAmountLabel);

$('deploy-amount-cancel-btn').addEventListener('click', () => {
  deployAmountModal.hidden = true;
  pendingDeployPlacement = null;
  refreshDeployUI();
  render();
});

$('deploy-amount-confirm-btn').addEventListener('click', () => {
  const pending = pendingDeployPlacement;
  deployAmountModal.hidden = true;
  pendingDeployPlacement = null;
  if (!pending) return;
  const amount = Number(deployAmountSlider.value);
  pushDeployHistory();
  if (placeSquad(game, myId, pending.templateIndex, pending.x, pending.y, amount)) {
    selectedDeployIndex = null;
  }
  syncDeployState();
  refreshDeployUI();
  render();
});

// ---------- 分隊 ----------
splitBtn.addEventListener('click', () => {
  if (splitBtn.disabled) return;
  const squad = selection.squad;
  // 100人を超える部隊は100人単位で、それ以下は1人単位で選べるようにする
  if (squad.count > MIN_ACTIVE_SOLDIERS) {
    const max = Math.floor((squad.count - 1) / MIN_ACTIVE_SOLDIERS) * MIN_ACTIVE_SOLDIERS;
    splitSlider.min = MIN_ACTIVE_SOLDIERS;
    splitSlider.max = max;
    splitSlider.step = MIN_ACTIVE_SOLDIERS;
    splitSlider.value = Math.min(max, Math.round(squad.count / 200) * MIN_ACTIVE_SOLDIERS || MIN_ACTIVE_SOLDIERS);
  } else {
    splitSlider.min = 1;
    splitSlider.max = squad.count - 1;
    splitSlider.step = 1;
    splitSlider.value = Math.floor(squad.count / 2);
  }
  updateSplitLabels(squad.count);
  splitModal.hidden = false;
});

splitSlider.addEventListener('input', () => updateSplitLabels(selection.squad.count));

function updateSplitLabels(total) {
  const a = Number(splitSlider.value);
  splitALabel.textContent = `A隊: ${a}`;
  splitBLabel.textContent = `B隊: ${total - a}`;
}

$('split-cancel-btn').addEventListener('click', () => (splitModal.hidden = true));

$('split-confirm-btn').addEventListener('click', () => {
  splitModal.hidden = true;
  selection.pendingAction = 'split-dest';
  selection.splitAmount = Number(splitSlider.value);
});

function tryFinishSplit(x, y) {
  const squad = selection.squad;
  const amount = selection.splitAmount;
  pushBattleHistory();
  const result = splitSquad(game, squad, amount, x, y);
  if (result) {
    afterPlayerAction();
  } else {
    battleHistory.pop();
    selection.pendingAction = null;
    updateActionButtons();
    render();
  }
}

// ---------- 射撃(弓兵) ----------
shootBtn.addEventListener('click', () => {
  if (shootBtn.disabled) return;
  selection.pendingAction = 'shoot';
});

function tryFinishShoot(x, y) {
  const squad = selection.squad;
  const archer = selection.archerTargets.find((a) => a.target.x === x && a.target.y === y);
  if (archer) {
    pushBattleHistory();
    rangedAttack(game, squad, archer.target);
    afterCombatAction();
  } else {
    selection.pendingAction = null;
    updateActionButtons();
    render();
  }
}

// ---------- ターン終了・降伏 ----------
$('end-turn-btn').addEventListener('click', () => {
  clearSelectionSilent();
  endTurn(game);
  afterPlayerAction();
});

$('surrender-btn').addEventListener('click', () => {
  showConfirm('本当に降伏しますか?', () => {
    surrender(game, myId);
    afterPlayerAction();
  });
});

function clearSelectionSilent() {
  selection = null;
}

// ---------- 戦闘後処理 ----------
function afterCombatAction() {
  const combat = game.lastCombat;
  clearSelectionSilent();
  combatModalFromPeer = false;
  if (combat) {
    if (isOnlineGame) broadcastState();
    showCombatModal(combat);
  } else {
    afterPlayerAction();
  }
}

// ---------- オンライン対戦: 戦闘フェーズの同期(ターン制なので手番側の状態を丸ごと送る) ----------
function broadcastState() {
  if (!isOnlineGame || !netClient) return;
  netClient.sendGameMessage({ kind: 'state', state: game });
}

function applyIncomingState(newState) {
  const wasDeploy = game?.phase === 'deploy';
  game = newState;
  if (wasDeploy && game.phase === 'battle') {
    showTurnOrderRoulette(game.currentPlayer, afterPeerSync);
    return;
  }
  if (game.lastCombat) {
    combatModalFromPeer = true;
    showCombatModal(game.lastCombat);
  } else {
    afterPeerSync();
  }
}

function afterPeerSync() {
  refreshDeployUI();
  render();
  if (game.phase === 'over') showResult();
}

function showCombatModal(c) {
  combatTitle.textContent = c.defenderDied ? '撃破!' : c.attackerDied ? '反撃で被害……' : '交戦結果';
  const side = (title, log, casualties, remaining) => `
    <div class="side">
      <b>${title}</b>
      ${log.map((b) => `<div class="bonus-line"><span>${b.label}</span><span>${b.value > 0 ? '+' : ''}${b.value}</span></div>`).join('')}
      <div class="bonus-line total-line"><span>損害</span><span>${casualties}人</span></div>
      <div class="bonus-line"><span>残存</span><span>${remaining}人</span></div>
    </div>`;
  combatBody.innerHTML =
    side('攻撃側 ' + c.attackerName, c.attackerLog, c.attackerCasualties, c.attackerRemaining) +
    (c.isRanged ? '<p class="hint">弓兵の射撃には反撃がありません</p>' : '') +
    side('防御側 ' + c.defenderName, c.defenderLog, c.defenderCasualties, c.defenderRemaining) +
    `<div class="result-line">${c.defenderDied ? '敵部隊は壊滅した!' : c.attackerDied ? '味方部隊が壊滅した……' : ''}</div>`;
  combatModal.hidden = false;
  vibrate(c.defenderDied || c.attackerDied ? [30, 40, 30] : 20);
}

$('combat-close-btn').addEventListener('click', () => {
  combatModal.hidden = true;
  if (combatModalFromPeer) afterPeerSync();
  else afterPlayerAction();
});

function afterPlayerAction() {
  if (isOnlineGame) broadcastState();
  refreshDeployUI();
  render();
  if (game.phase === 'over') {
    showResult();
    return;
  }
  if (!isOnlineGame && game.phase === 'battle' && game.currentPlayer === 'B') {
    setTimeout(runCpuTurn, 400);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let cpuTurnRunning = false;

async function runCpuTurn() {
  if (cpuTurnRunning) return;
  cpuTurnRunning = true;
  let status = 'acted';
  while (status !== 'ended' && game.phase === 'battle' && game.currentPlayer === 'B') {
    status = cpuStepTurn(game, renderer, 'B');
    refreshDeployUI();
    render();
    if (game.phase === 'over') break;
    if (status === 'acted') await sleep(500);
    else if (status === 'passed') await sleep(80);
  }
  cpuTurnRunning = false;
  if (game.phase === 'over') showResult();
}

const VICTORY_GEM_REWARD = { easy: 30, official: 50, normal: 60, large: 100, story: 80 };

function showResult() {
  if (game.winner === 'draw') {
    resultTitle.textContent = '引き分け';
    resultDesc.textContent = '両軍の大将が相討ちとなりました。';
  } else {
    const winnerName = game.players[game.winner].name;
    resultTitle.textContent = game.winner === myId ? '勝利!' : '敗北……';
    resultDesc.textContent = `${winnerName}の勝利です。`;
    if (game.winner === myId) {
      const reward = VICTORY_GEM_REWARD[game.mode.id] || 30;
      profile.gems += reward;
      saveProfile(profile);
      updateGemDisplay();
      resultDesc.textContent += ` 💎${reward}を獲得しました!`;
      if (game.isStory) {
        const pos = resolveStoryPosition(profile.storyProgress);
        if (pos && pos.nation.id === game.storyNation.id) {
          const isLastTerritory = pos.territoryIndex === pos.nation.territories - 1;
          const absorbed = applyStoryVictory(game, profile, isLastTerritory);
          profile.storyProgress += 1;
          saveProfile(profile);
          const isCampaignClear = profile.storyProgress >= totalStoryTerritories();
          const absorbedText = Object.entries(absorbed)
            .map(([type, n]) => `${UNIT_STATS[type].label}${n}`)
            .join('・');
          resultTitle.textContent = `${winnerName}を撃破!`;
          resultDesc.textContent += absorbedText
            ? ` 降伏兵(${absorbedText})を吸収しました。`
            : '';
          resultDesc.textContent += isCampaignClear
            ? ' ついに黎明の大地を統一しました!'
            : isLastTerritory
              ? ` ${game.storyNation.name}を完全に平定しました!`
              : ` ${game.storyNation.name}の別動隊を撃退しました(残り領土あり)。`;
        }
      }
    }
  }
  resultModal.hidden = false;
  vibrate(game.winner === myId ? [40, 60, 40, 60, 80] : [200]);
}

$('restart-btn').addEventListener('click', () => {
  resultModal.hidden = true;
  leaveOnlineGame();
  showScreen('menu');
});

function leaveOnlineGame() {
  if (isOnlineGame) netClient?.leave();
  isOnlineGame = false;
  isHost = false;
  myId = 'A';
  deployReady = { A: false, B: false };
}

// ---------- ログドロワー ----------
$('log-btn').addEventListener('click', () => {
  logDrawer.hidden = false;
  updateLog();
});
$('log-close-btn').addEventListener('click', () => (logDrawer.hidden = true));

// ---------- メニュー・ルール ----------
$('menu-btn').addEventListener('click', () => {
  showConfirm('メニューに戻りますか?(進行中の対戦は失われます)', () => {
    leaveOnlineGame();
    showScreen('menu');
  });
});
$('rules-btn').addEventListener('click', () => (rulesModal.hidden = false));
$('rules-close-btn').addEventListener('click', () => (rulesModal.hidden = true));

// ---------- ジェム・ショップ(実際の課金は行わないシミュレーション) ----------
function updateGemDisplay() {
  gemCountEl.textContent = `💎 ${profile.gems}`;
  shopGemCountEl.textContent = `💎 ${profile.gems}`;
}

function refreshShopUI() {
  updateGemDisplay();
  // ガチャは近日公開のため、所持ジェムに関わらず常に押せない状態にしておく
  cardGachaBtn.disabled = true;
  generalGachaBtn.disabled = true;

  cardOwnedList.innerHTML = '';
  for (const def of Object.values(PREMIUM_CARD_DEFS)) {
    const owned = profile.unlockedCards.includes(def.id);
    const chip = document.createElement('span');
    chip.className = 'owned-chip' + (owned ? '' : ' locked');
    chip.textContent = owned ? `${def.name} 入手済み` : `${def.name} 未入手`;
    cardOwnedList.appendChild(chip);
  }

  generalOwnedList.innerHTML = '';
  for (const type of GENERAL_UPGRADE_TYPES) {
    const owned = profile.unlockedGenerals.includes(type);
    const chip = document.createElement('span');
    chip.className = 'owned-chip' + (owned ? '' : ' locked');
    chip.textContent = owned ? `${UNIT_STATS[type].label}の名将 入手済み` : `${UNIT_STATS[type].label}の名将 未入手`;
    generalOwnedList.appendChild(chip);
  }
}

shopBtn.addEventListener('click', () => {
  refreshShopUI();
  shopModal.hidden = false;
});
$('shop-close-btn').addEventListener('click', () => (shopModal.hidden = true));

function showGachaResult(title, desc) {
  gachaResultBody.innerHTML = `<p><b>${title}</b></p><p class="hint">${desc}</p>`;
  gachaResultModal.hidden = false;
}
$('gacha-result-close-btn').addEventListener('click', () => (gachaResultModal.hidden = true));

cardGachaBtn.addEventListener('click', () => {
  const locked = Object.values(PREMIUM_CARD_DEFS).filter((c) => !profile.unlockedCards.includes(c.id));
  if (!locked.length || !spendGems(profile, CARD_GACHA_COST)) return;
  const won = locked[Math.floor(Math.random() * locked.length)];
  profile.unlockedCards.push(won.id);
  saveProfile(profile);
  refreshShopUI();
  showGachaResult(`🎴 ${won.name}`, won.desc);
});

generalGachaBtn.addEventListener('click', () => {
  const locked = GENERAL_UPGRADE_TYPES.filter((t) => !profile.unlockedGenerals.includes(t));
  if (!locked.length || !spendGems(profile, GENERAL_GACHA_COST)) return;
  const won = locked[Math.floor(Math.random() * locked.length)];
  profile.unlockedGenerals.push(won);
  saveProfile(profile);
  refreshShopUI();
  showGachaResult(`👑 ${UNIT_STATS[won].label}の名将`, `${UNIT_STATS[won].label}が大将の時、ランク+1されます`);
});

function showLoginBonusIfAny() {
  const bonus = checkLoginBonus(profile);
  updateGemDisplay();
  if (!bonus) return;
  loginBonusText.textContent = `${bonus.day}日目のログインボーナスとして💎${bonus.reward}を獲得しました!(所持ジェム: ${bonus.gems})`;
  loginBonusModal.hidden = false;
}
$('login-bonus-close-btn').addEventListener('click', () => (loginBonusModal.hidden = true));

// ---------- スマホアプリらしい挙動の下支え ----------

// PWAとして起動している時は縦画面に固定しておく(通常のブラウザタブでは対応環境のみ)
function lockOrientation() {
  const orientation = screen.orientation;
  if (orientation?.lock) {
    orientation.lock('portrait').catch(() => {});
  }
}
lockOrientation();
window.addEventListener('load', lockOrientation);

// iOSのピンチズーム(ページ全体拡大)やダブルタップズームが独自ジェスチャーと競合しないようにする
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

// 端末が対応していれば軽い振動フィードバックを返す(未対応環境では何も起きない)
function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

// Androidの「ホーム画面に追加」導線をこちらのボタンからも出せるようにする
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});
installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

// Androidの戻るボタンでアプリごと閉じてしまわないよう、モーダルやメニューを1段階ずつ閉じる
// モーダル/ゲーム画面が「表示される」たびに履歴を1つ積んでおき、戻るボタンでは
// それを消費して該当レイヤーを閉じるだけにする(閉じるボタン側の処理は変更不要)
const backGuardedOverlays = [
  gachaResultModal,
  loginBonusModal,
  shopModal,
  rulesModal,
  confirmModal,
  deployAmountModal,
  splitModal,
  resultModal,
  combatModal,
  logDrawer,
  gameScreen,
];
history.replaceState({ wcScreen: 'menu' }, '');
const overlayHistoryObserver = new MutationObserver((mutations) => {
  if (mutations.some((m) => !m.target.hidden)) {
    history.pushState({ wcScreen: 'overlay' }, '');
  }
});
for (const el of backGuardedOverlays) {
  if (el) overlayHistoryObserver.observe(el, { attributes: true, attributeFilter: ['hidden'] });
}

window.addEventListener('popstate', () => {
  closeTopmostOverlay();
});

function closeTopmostOverlay() {
  const overlays = [
    gachaResultModal,
    loginBonusModal,
    shopModal,
    rulesModal,
    confirmModal,
    deployAmountModal,
    splitModal,
    resultModal,
    combatModal,
    logDrawer,
  ];
  for (const el of overlays) {
    if (el && !el.hidden) {
      el.hidden = true;
      return true;
    }
  }
  if (!gameScreen.hidden) {
    showScreen('menu');
    return true;
  }
  return false;
}

// ---------- 初期化 ----------
buildMenu();
showScreen('menu');
registerServiceWorker();
updateGemDisplay();
showLoginBonusIfAny();
initSplash();

function initSplash() {
  const finishSplash = () => {
    splashScreen.hidden = true;
  };
  splashScreen.addEventListener('click', finishSplash, { once: true });
  setTimeout(finishSplash, 2400);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}




