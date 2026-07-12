import { MODES, getMode } from './core/modes.js';
import { canSplit, canMerge } from './core/squad.js';
import { isAdjacent } from './core/board.js';
import { TERRAIN } from './core/terrain.js';
import { MIN_ACTIVE_SOLDIERS, MAX_SQUAD_SIZE, UNIT_TYPES, UNIT_STATS } from './core/units.js';
import { loadProfile, saveProfile, checkLoginBonus, spendGems, DEFAULT_PROFILE } from './core/profile.js';
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
import {
  STORY_NATIONS, PLAYER_NATION, findNation, selectableStoryDifficulties, findDifficulty, PLAYER_CHARACTERS, findPlayerCharacter,
  effectiveNationTroops, worldBoostFactor, justCrossedWorldBoostThreshold,
  PROLOGUE_TEXT, dialogueSetFor, isRecruitable, getNationForDifficulty, recruitableCharacterFor,
} from './core/story.js';
import {
  CHARACTER_CARDS, findCharacterCard, CHARACTER_GACHA_UNLOCK_COUNT, CHARACTER_GACHA_STEP, characterCollectionBonus,
  RARITY_LABEL, RARITY_RANK_BONUS, characterDropRate, pickWeightedCharacterCard,
  getActivePickupBanner, pickWeightedCharacterCardForBanner,
} from './core/characters.js';
import { createStoryGame, applyStoryVictory, viceGeneralCountFor, getPlayerTotalTroops, balancedTileTroopCount, CAPITAL_GARRISON_SHARE } from './core/storyBattle.js';
import {
  generateWorldMap,
  STARTER_MAP_SEED,
  RANDOM_MAP_SEEDS,
  getAttackableTiles,
  getAllianceCandidates,
  remainingTileCount,
  totalTileCount,
  simulateRivalIncursions,
  simulateGreatPowerDynamics,
  isNeutralTile,
  isCapitalTile,
  isFortressTile,
  ensureMapExtras,
} from './core/worldMap.js';
import { Renderer2D as Renderer } from './ui/render2d.js';
import { InputController } from './ui/input.js';
import { NetClient } from './net/client.js';
import { getPortraitDataUrl } from './ui/portraits.js';
import { unlockAudio, playSfx, setMuted, isMuted } from './audio/sound.js';

const $ = (id) => document.getElementById(id);

const splashScreen = $('splash-screen');
const menuScreen = $('menu-screen');
const gameScreen = $('game-screen');
const installBtn = $('install-btn');
const muteBtn = $('mute-btn');
const modeList = $('mode-list');
const topModeList = $('top-mode-list');
const cpuModePanel = $('cpu-mode-panel');
const topCpuBtn = $('top-cpu-btn');
const cpuModeBackBtn = $('cpu-mode-back-btn');
const modeListDots = $('mode-list-dots');
const cpuCardToggle = $('cpu-card-toggle');
const cpuCardToggleHint = $('cpu-card-toggle-hint');
const turnIndicator = $('turn-indicator');
const canvas = $('board-canvas');
const canvasWrap = $('canvas-wrap');
const squadInfoEl = $('squad-info');
const deployPanel = $('deploy-panel');
const battlePanel = $('battle-panel');
const deployList = $('deploy-list');
const cardHand = $('card-hand');
const cardCutin = $('card-cutin');
const cardCutinBand = document.querySelector('#card-cutin .card-cutin-band');
const cardCutinIcon = $('card-cutin-icon');
const cardCutinType = $('card-cutin-type');
const cardCutinName = $('card-cutin-name');
const cardCutinDesc = $('card-cutin-desc');
const nationQuoteBanner = $('nation-quote-banner');
const nationQuotePortrait = $('nation-quote-portrait');
const nationQuoteName = $('nation-quote-name');
const nationQuoteBody = $('nation-quote-body');
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
const tutorialModal = $('tutorial-modal');
const tutorialDots = $('tutorial-dots');
const tutorialTitle = $('tutorial-title');
const tutorialBody = $('tutorial-body');
const tutorialSkipBtn = $('tutorial-skip-btn');
const tutorialNextBtn = $('tutorial-next-btn');
const tutorialBtn = $('tutorial-btn');
const confirmModal = $('confirm-modal');
const confirmMessage = $('confirm-message');
const confirmYesBtn = $('confirm-yes-btn');
const confirmNoBtn = $('confirm-no-btn');
const gemCountEl = $('gem-count');
const shopGemCountEl = $('shop-gem-count');
const homeStatStreakEl = $('home-stat-streak');
const homeStatCollectionEl = $('home-stat-collection');
const homeStatStoryEl = $('home-stat-story');
const devCodeInput = $('dev-code-input');
const devCodeSubmitBtn = $('dev-code-submit-btn');
const devPanel = $('dev-panel');
const devResetStoryBtn = $('dev-reset-story-btn');
const devResetGachaBtn = $('dev-reset-gacha-btn');
const devResetCpuBtn = $('dev-reset-cpu-btn');
const devResetMiscBtn = $('dev-reset-misc-btn');
const devResetAllBtn = $('dev-reset-all-btn');
const devGemsInput = $('dev-gems-input');
const devGemsApplyBtn = $('dev-gems-apply-btn');
const devReserveInfantryInput = $('dev-reserve-infantry-input');
const devReserveArcherInput = $('dev-reserve-archer-input');
const devReserveCavalryInput = $('dev-reserve-cavalry-input');
const devReserveApplyBtn = $('dev-reserve-apply-btn');
const homePager = $('home-pager');
const homeTabBtns = [...document.querySelectorAll('.home-tab-btn')];
const storyCardsList = $('story-cards-list');
const lineupEditorList = $('lineup-editor-list');
const characterGachaBtn = $('character-gacha-btn');
const characterGacha10Btn = $('character-gacha10-btn');
const characterGachaFirstHint = $('character-gacha-first-hint');
const characterGachaCostEl = $('character-gacha-cost');
const characterGacha10CostEl = $('character-gacha10-cost');
const pickupGachaSection = $('pickup-gacha-section');
const pickupBannerTitle = $('pickup-banner-title');
const pickupBannerPortraits = $('pickup-banner-portraits');
const pickupGachaBtn = $('pickup-gacha-btn');
const pickupGacha10Btn = $('pickup-gacha10-btn');
const pickupGachaCostEl = $('pickup-gacha-cost');
const pickupGacha10CostEl = $('pickup-gacha10-cost');
const pickupGachaFirstHint = $('pickup-gacha-first-hint');
const collectionSummaryEl = $('collection-summary');
const openCollectionBtn = $('open-collection-btn');
const collectionSort = $('collection-sort');
const collectionFilterStatus = $('collection-filter-status');
const collectionFilterRarity = $('collection-filter-rarity');
const collectionFilterType = $('collection-filter-type');
const collectionFilterNation = $('collection-filter-nation');
const collectionCountSummary = $('collection-count-summary');
const collectionList = $('collection-list');
const collectionFeaturedList = $('collection-featured-list');
const characterDetailModal = $('character-detail-modal');
const characterDetailPortrait = $('character-detail-portrait');
const characterDetailName = $('character-detail-name');
const characterDetailTitle = $('character-detail-title');
const characterDetailStars = $('character-detail-stars');
const characterDetailStatus = $('character-detail-status');
const characterDetailRate = $('character-detail-rate');
const characterDetailCloseBtn = $('character-detail-close-btn');
const gachaPullModal = $('gacha-pull-modal');
const gachaPullProgress = $('gacha-pull-progress');
const gachaCapsule = $('gacha-capsule');
const gachaRevealCard = $('gacha-reveal-card');
const gachaRevealPortrait = $('gacha-reveal-portrait');
const gachaRevealRarity = $('gacha-reveal-rarity');
const gachaRevealName = $('gacha-reveal-name');
const gachaRevealTitle = $('gacha-reveal-title');
const gachaRevealSkill = $('gacha-reveal-skill');
const gachaRevealMilestone = $('gacha-reveal-milestone');
const gachaSummary = $('gacha-summary');
const gachaSummaryGrid = $('gacha-summary-grid');
const gachaPullNextBtn = $('gacha-pull-next-btn');
const gachaPullSkipBtn = $('gacha-pull-skip-btn');
const gachaPullCloseBtn = $('gacha-pull-close-btn');
const loginBonusModal = $('login-bonus-modal');
const loginBonusText = $('login-bonus-text');
const onlineBtn = $('top-online-btn');
const onlineModal = $('online-modal');
const onlineCloseBtn = $('online-close-btn');
const onlineSetupView = $('online-setup-view');
const onlineWaitingView = $('online-waiting-view');
const onlineModeList = $('online-mode-list');
const onlineAutoMatchBtn = $('online-auto-match-btn');
const onlineCodeInput = $('online-code-input');
const onlineCodeBtn = $('online-code-btn');
const onlineCodeSaveBtn = $('online-code-save-btn');
const savedPassphraseList = $('saved-passphrase-list');
const onlineCancelBtn = $('online-cancel-btn');
const onlineErrorText = $('online-error-text');
const peerLeftModal = $('peer-left-modal');
const peerLeftCloseBtn = $('peer-left-close-btn');
const turnorderModal = $('turnorder-modal');
const turnorderChipA = $('turnorder-a');
const turnorderChipB = $('turnorder-b');
const turnorderResult = $('turnorder-result');
const storyDifficultyModal = $('story-difficulty-modal');
const storyDifficultyList = $('story-difficulty-list');
const storyPrologueModal = $('story-prologue-modal');
const storyPrologueText = $('story-prologue-text');
const storyPrologueStartBtn = $('story-prologue-start-btn');
const storyMapGrid = $('story-map-grid');
const storyMapLegend = $('story-map-legend');
const storyStartOverlay = $('story-start-overlay');
const storyStartOverlayBtn = $('story-start-overlay-btn');
const storyResetBtn = $('story-reset-btn');
const storyReserveEl = $('story-reserve');
const storyTileModal = $('story-tile-modal');
const storyTileTitle = $('story-tile-title');
const storyTileDesc = $('story-tile-desc');
const storyTilePortrait = $('story-tile-portrait');
const characterSelectModal = $('character-select-modal');
const characterSelectList = $('character-select-list');
const charSelectViceRemaining = $('char-select-vice-remaining');
const characterSelectConfirmBtn = $('character-select-confirm-btn');
const characterSelectCancelBtn = $('character-select-cancel-btn');
const formationAttackBtn = $('formation-attack-btn');
const formationDefenseBtn = $('formation-defense-btn');
const storyTileAttackBtn = $('story-tile-attack-btn');
const storyTileAllyBtn = $('story-tile-ally-btn');
const storyTileCancelBtn = $('story-tile-cancel-btn');
const capitalDefenseModal = $('capital-defense-modal');
const capitalDefenseTitle = $('capital-defense-title');
const capitalDefenseDesc = $('capital-defense-desc');
const capitalDefenseConfirmBtn = $('capital-defense-confirm-btn');

const CHARACTER_GACHA_COST = 300;
const CHARACTER_GACHA_TEN_COST = 2500;
const CHARACTER_GACHA_TEN_FIRST_COST = 500;

const DEV_CODE = 'test0826'; // 開発者モード解除コード(テストプレイ用の裏設定)

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
let combatModalResolve = null; // CPUの攻撃結果を表示中、プレイヤーが閉じるまでターン進行を止めておくためのPromise resolve

// ---------- 画面遷移 ----------
function showScreen(name) {
  menuScreen.hidden = name !== 'menu';
  gameScreen.hidden = name !== 'game';
  if (name === 'menu') {
    cpuModePanel.hidden = true;
    topModeList.hidden = false;
    renderBattleMap();
  }
}

function buildMenu() {
  modeList.innerHTML = '';
  modeListDots.innerHTML = '';
  Object.values(MODES).forEach((mode, i) => {
    const btn = document.createElement('button');
    btn.className = `mode-card ${mode.id}`;
    btn.innerHTML = `<b>${mode.name}</b><span>${mode.desc}</span>`;
    btn.addEventListener('click', () => handleModeCardClick(mode.id));
    modeList.appendChild(btn);

    const dot = document.createElement('span');
    dot.addEventListener('click', () => scrollModeCarouselTo(i));
    modeListDots.appendChild(dot);
  });
}

let modeScrollTimer = null;
function scrollModeCarouselTo(i) {
  const card = modeList.children[i];
  if (!card) return;
  modeList.scrollTo({ left: card.offsetLeft - (modeList.clientWidth - card.clientWidth) / 2, behavior: 'smooth' });
}
function updateModeDots() {
  if (!modeList.children.length) return;
  const center = modeList.scrollLeft + modeList.clientWidth / 2;
  let closest = 0;
  let closestDist = Infinity;
  [...modeList.children].forEach((card, i) => {
    const cardCenter = card.offsetLeft + card.clientWidth / 2;
    const d = Math.abs(cardCenter - center);
    if (d < closestDist) {
      closestDist = d;
      closest = i;
    }
  });
  [...modeListDots.children].forEach((dot, i) => dot.classList.toggle('active', i === closest));
}
modeList.addEventListener('scroll', () => {
  clearTimeout(modeScrollTimer);
  modeScrollTimer = setTimeout(updateModeDots, 60);
});

topCpuBtn.addEventListener('click', () => {
  topModeList.hidden = true;
  cpuModePanel.hidden = false;
  requestAnimationFrame(updateModeDots);
  updateCpuCardToggleUI();
});
cpuModeBackBtn.addEventListener('click', () => {
  cpuModePanel.hidden = true;
  topModeList.hidden = false;
});

function updateCpuCardToggleUI() {
  const hasCharacters = profile.unlockedCharacters.length > 0;
  cpuCardToggle.disabled = !hasCharacters;
  cpuCardToggle.checked = hasCharacters && !!profile.useCardsInCpuBattle;
  cpuCardToggleHint.textContent = hasCharacters ? '' : '(ガチャで武将を仲間にすると使えます)';
}
cpuCardToggle.addEventListener('change', () => {
  profile.useCardsInCpuBattle = cpuCardToggle.checked;
  saveProfile(profile);
});

function startGame(modeId) {
  isOnlineGame = false;
  isHost = false;
  myId = 'A';
  game = createGame(getMode(modeId), profile);
  enterGameScreen();
}

function handleModeCardClick(modeId) {
  if (cpuCardToggle.checked && profile.unlockedCharacters.length > 0) {
    const unlockedRoster = CHARACTER_CARDS.filter((c) => profile.unlockedCharacters.includes(c.id));
    const mode = getMode(modeId);
    openCharacterSelect(
      (generalId, viceIds, formation) => {
        isOnlineGame = false;
        isHost = false;
        myId = 'A';
        game = createGame(mode, profile, generalId, viceIds, formation);
        enterGameScreen();
      },
      {
        roster: unlockedRoster,
        viceLimit: mode.viceGeneralCount || 0,
        persistKeys: { general: 'cpuLastGeneral', vice: 'cpuLastViceGenerals' },
      }
    );
  } else {
    startGame(modeId);
  }
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

// ---------- ストーリーモード(『黎明の大地』国盗り合戦・世界地図) ----------
function ensureStoryMap() {
  if (!profile.storyMap) {
    if (!profile.hasPlayedStoryMode) {
      // 初回プレイヤー全員に共通の固定初期マップ
      profile.storyMap = generateWorldMap(STARTER_MAP_SEED);
      profile.hasPlayedStoryMode = true;
    } else {
      // 2周目以降(リセット・周回のたび)は30種類のシードからランダムに1つ選ぶ
      const seed = RANDOM_MAP_SEEDS[Math.floor(Math.random() * RANDOM_MAP_SEEDS.length)];
      profile.storyMap = generateWorldMap(seed);
    }
    saveProfile(profile);
  } else if (!profile.storyMap.capitals || !profile.storyMap.fortresses) {
    // 王都・砦の仕組みを追加する前に作られた古いセーブデータを補完する
    ensureMapExtras(profile.storyMap);
    saveProfile(profile);
  }
  return profile.storyMap;
}

function storyOwners() {
  return profile.storyMap.owners;
}

// 指定マスから見て(dx,dy)方向の隣が同じ国(元々の領有国)かどうか。占領状態(owners)ではなく
// 元々の領有国(tiles)で判定することで、途中で占領されても国境の見た目の形は変わらないようにする
function isSameNationNeighbor(map, i, dx, dy) {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return false;
  return map.tiles[ny * map.width + nx] === map.tiles[i];
}

let selectedStoryTileIndex = null;

function buildStoryMap() {
  const map = ensureStoryMap();
  const owners = storyOwners();
  const alliances = profile.storyAlliances;
  const attackable = getAttackableTiles(map, owners, alliances);

  storyMapGrid.innerHTML = '';
  for (let i = 0; i < map.tiles.length; i++) {
    const nationId = map.tiles[i];
    const owner = owners[i];
    const tile = document.createElement('button');
    tile.className = 'story-map-tile';
    if (nationId) {
      // 同じ国の隣接マス同士は角を四角くし、国境に面した角だけ丸めることで、
      // マス目のまま一つの滑らかな領土の塊に見えるようにする
      const up = isSameNationNeighbor(map, i, 0, -1);
      const down = isSameNationNeighbor(map, i, 0, 1);
      const left = isSameNationNeighbor(map, i, -1, 0);
      const right = isSameNationNeighbor(map, i, 1, 0);
      const round = '11px';
      const flat = '2px';
      tile.style.borderRadius =
        `${up || left ? flat : round} ${up || right ? flat : round} ` +
        `${down || right ? flat : round} ${down || left ? flat : round}`;
    }
    if (!nationId) {
      tile.style.background = '#e6ebf1';
    } else if (owner === 'sealed') {
      // 隠しボス「ラセル」の封印された領土。ヘルモード制覇まではロックされた暗いマスとして見せるだけで、
      // 首都・砦の場所も伏せておく(下のcapital/fortressクラス付与を通らないようにする)
      tile.style.background = '#1a1220';
      tile.classList.add('sealed');
    } else if (owner === 'player') {
      tile.style.background = PLAYER_NATION.color;
      tile.classList.add('player');
    } else {
      const nation = findNation(nationId);
      tile.style.background = nation?.color || '#999';
      if (alliances.includes(nationId)) tile.classList.add('allied');
      if (attackable.has(i)) tile.classList.add('attackable');
      else if (owner !== 'player') tile.classList.add('locked');
    }
    if (isCapitalTile(map, i) && owner !== 'player' && owner !== 'sealed') tile.classList.add('capital');
    if (isFortressTile(map, i) && owner !== 'player' && owner !== 'sealed') tile.classList.add('fortress');
    if (nationId && owner !== 'player' && owner !== 'sealed' && attackable.has(i)) {
      if (isNeutralTile(map, owners, i)) {
        tile.title = '無主化した土地(戦闘なしでそのまま制圧できます)';
        tile.addEventListener('click', () => claimNeutralTile(i));
      } else {
        tile.addEventListener('click', () => openStoryTileModal(i));
      }
    }
    storyMapGrid.appendChild(tile);
  }

  storyMapLegend.innerHTML = `
    <span><i style="background:${PLAYER_NATION.color}"></i>あなた(黎明)</span>
    ${STORY_NATIONS.filter((n) => !n.isHiddenBoss || profile.laselUnsealed)
      .map((n) => `<span><i style="background:${n.color}"></i>${n.name}</span>`)
      .join('')}
    <span>🏰 王城(ここを落とせば総取り)</span>
    <span>🏯 前線の砦</span>
  `;

  const reserve = profile.storyReserve;
  storyReserveEl.textContent = `予備兵力: 歩兵${reserve.infantry || 0} / 弓兵${reserve.archer || 0} / 騎兵${reserve.cavalry || 0}`;
}

// バトルタブに常設した世界地図まわり(出陣メンバー・ストーリー武将一覧を含む)を丸ごと最新状態に描画する。
// 難易度未選択の間は地図の上に「冒険を始める」オーバーレイを重ねてタップできないようにしておく
function renderBattleMap() {
  if (profile.storyPendingDefense) showCapitalDefensePrompt();
  buildStoryMap();
  storyStartOverlay.hidden = !!profile.storyDifficulty;
  renderLineupEditor();
  renderStoryCards();
}

storyStartOverlayBtn.addEventListener('click', () => {
  buildStoryDifficultyList();
  storyDifficultyModal.hidden = false;
});

function openStoryTileModal(tileIndex) {
  const map = profile.storyMap;
  const nationId = map.tiles[tileIndex];
  const nation = findNation(nationId);
  if (!nation) return;
  selectedStoryTileIndex = tileIndex;
  const owners = storyOwners();
  const remaining = remainingTileCount(map, owners, nationId);
  const total = totalTileCount(map, nationId);
  storyTileTitle.textContent = `${nation.name}(${nation.monarch})`;
  storyTilePortrait.src = getPortraitDataUrl(nationId);
  const capitalNote = isCapitalTile(map, tileIndex)
    ? ' 🏰この国の王城です。落とせば残り領土を総取りできます!'
    : isFortressTile(map, tileIndex)
      ? ' 🏯この国の前線の砦です。守りが堅い要衝です。'
      : '';
  storyTileDesc.textContent = `${nation.desc} 残り領土 ${remaining}/${total}${capitalNote}`;
  const alreadyAllied = profile.storyAlliances.includes(nationId);
  storyTileAllyBtn.hidden = alreadyAllied;
  storyTileModal.hidden = false;
}

// 大国同士の争いで無主化した土地は、戦闘なしでそのまま制圧できる
function claimNeutralTile(tileIndex) {
  profile.storyMap.owners[tileIndex] = 'player';
  saveProfile(profile);
  buildStoryMap();
}

storyTileCancelBtn.addEventListener('click', () => {
  storyTileModal.hidden = true;
  selectedStoryTileIndex = null;
});

storyTileAllyBtn.addEventListener('click', () => {
  const map = profile.storyMap;
  const nationId = map.tiles[selectedStoryTileIndex];
  if (nationId && !profile.storyAlliances.includes(nationId)) {
    profile.storyAlliances.push(nationId);
    saveProfile(profile);
  }
  storyTileModal.hidden = true;
  selectedStoryTileIndex = null;
  buildStoryMap();
});

storyTileAttackBtn.addEventListener('click', () => {
  const tileIndex = selectedStoryTileIndex;
  storyTileModal.hidden = true;
  selectedStoryTileIndex = null;
  startStoryBattle(tileIndex);
});

function storyCharacterRoster() {
  const lostIds = profile.storyLostCharacterIds || [];
  const recruited = (profile.storyRecruitedCharacterIds || []).map(recruitableCharacterFor).filter(Boolean);
  return [...PLAYER_CHARACTERS, ...recruited].filter((c) => !lostIds.includes(c.id));
}

// ストーリーモードのキャンペーン進行状態だけをすべて初期状態に戻す(王都陥落時と、手動リセット時の両方で使う)。
// ジェム・ガチャ・武将図鑑・通常CPU対戦の設定など、ストーリー以外のプロフィールには一切触れない
function resetStoryCampaign(prof) {
  prof.storyMap = null;
  prof.storyAlliances = [];
  prof.storyDifficulty = null;
  prof.storyReserve = { infantry: 0, archer: 0, cavalry: 0 };
  prof.storyBattlesCompleted = 0;
  prof.storyLostCharacterIds = [];
  prof.storyRecruitedCharacterIds = [];
  prof.storyLastGeneral = null;
  prof.storyLastViceGenerals = [];
  prof.storyPendingDefense = null;
}

function startStoryBattle(tileIndex) {
  const map = profile.storyMap;
  const nationId = map.tiles[tileIndex];
  const nation = getNationForDifficulty(nationId, profile.storyDifficulty);
  if (!nation) return;
  const total = totalTileCount(map, nationId);
  const difficulty = findDifficulty(profile.storyDifficulty);
  const isCapital = isCapitalTile(map, tileIndex);
  const naturalCount = isCapital
    ? Math.round(effectiveNationTroops(nation, profile) * CAPITAL_GARRISON_SHARE * difficulty.scoreMultiplier)
    : Math.round((effectiveNationTroops(nation, profile) / total) * difficulty.scoreMultiplier);
  const tileTroopCount = Math.max(1000, balancedTileTroopCount(naturalCount, getPlayerTotalTroops(profile), profile.storyBattlesCompleted));
  const landmark = isCapital ? 'castle' : isFortressTile(map, tileIndex) ? 'fortress' : null;
  const roster = storyCharacterRoster();
  openCharacterSelect((generalId, viceIds, formation) => {
    isOnlineGame = false;
    isHost = false;
    myId = 'A';
    game = createStoryGame(nation, tileTroopCount, profile, landmark, generalId, viceIds, { formation });
    game.storyTileIndex = tileIndex;
    enterGameScreen();
    if (isCapital) {
      const dialogueSet = dialogueSetFor(nationId, profile.storyDifficulty);
      game.storyDialogueSet = dialogueSet;
      game.storyCombatEventCount = 0;
      showNationQuote(nation, dialogueSet?.battleStart);
    }
  }, { roster: roster.length ? roster : PLAYER_CHARACTERS });
}

// ---------- 拠点防衛戦(王都・敵国から奪った首都タイルへの侵犯を、自動没収ではなく実戦闘で決着させる) ----------
function startCapitalDefenseBattle(tileIndex, attackerNationId) {
  const map = profile.storyMap;
  const nation = getNationForDifficulty(attackerNationId, profile.storyDifficulty);
  if (!nation) return;
  const total = totalTileCount(map, nation.id) || 1;
  const difficulty = findDifficulty(profile.storyDifficulty);
  const naturalCount = Math.round((effectiveNationTroops(nation, profile) / total) * difficulty.scoreMultiplier);
  const tileTroopCount = Math.max(1000, balancedTileTroopCount(naturalCount, getPlayerTotalTroops(profile), profile.storyBattlesCompleted));
  const isNativeCapital = map.tiles[tileIndex] === PLAYER_NATION.id;
  const roster = storyCharacterRoster();

  if (roster.length === 0) {
    // 迎撃できる武将が誰も残っていない: 選択UIを開かず自動的に防衛失敗として処理する
    const game = { isDefenseBattle: true, defenseTileIndex: tileIndex, defenseAttackerNationId: attackerNationId, defenseIsNativeCapital: isNativeCapital, defenseGeneralId: null, defenseViceIds: [] };
    profile.storyPendingDefense = null;
    resultTitle.textContent = isNativeCapital ? '王都陥落……' : '拠点陥落……';
    resultDesc.textContent = '迎撃できる武将が残っていません……';
    resultDesc.textContent += resolveCapitalDefenseOutcome(game, false);
    resultModal.hidden = false;
    playSfx('defeat');
    vibrate([200]);
    return;
  }

  openCharacterSelect(
    (generalId, viceIds, formation) => {
      isOnlineGame = false;
      isHost = false;
      myId = 'A';
      game = createStoryGame(nation, tileTroopCount, profile, 'castle', generalId, viceIds, { isDefenseBattle: true, formation });
      game.defenseTileIndex = tileIndex;
      game.defenseAttackerNationId = attackerNationId;
      game.defenseIsNativeCapital = isNativeCapital;
      game.defenseGeneralId = generalId;
      game.defenseViceIds = viceIds;
      enterGameScreen();
      // 防衛戦(自分の王都・拠点が攻められた側)ではセリフを出さない。敵の首都を攻める側の戦闘のみで表示する
    },
    { roster, persistKeys: { general: 'storyLastGeneral', vice: 'storyLastViceGenerals' }, allowCancel: false }
  );
}

function showCapitalDefensePrompt() {
  const pending = profile.storyPendingDefense;
  if (!pending) return;
  const nation = findNation(pending.attackerNationId);
  const isNativeCapital = profile.storyMap?.tiles[pending.tileIndex] === PLAYER_NATION.id;
  capitalDefenseTitle.textContent = isNativeCapital ? '⚔️ 王都が攻撃されています!' : '⚔️ 拠点が攻撃されています!';
  capitalDefenseDesc.textContent = `${nation?.name || pending.attackerNationId}が攻め込んできました。迎撃する武将を選びましょう。`;
  capitalDefenseModal.hidden = false;
  playSfx('error');
  vibrate([80, 40, 80]);
}

capitalDefenseConfirmBtn.addEventListener('click', () => {
  const pending = profile.storyPendingDefense;
  profile.storyPendingDefense = null;
  saveProfile(profile);
  capitalDefenseModal.hidden = true;
  if (pending) startCapitalDefenseBattle(pending.tileIndex, pending.attackerNationId);
});

// ---------- 出陣メンバー(大将・副将)選択(ストーリーモード・通常CPU対戦「カードあり」の両方で共用) ----------
let charSelectGeneral = null;
let charSelectVice = new Set();
let charSelectOnConfirm = null;
let charSelectViceLimit = 0;
let charSelectRoster = PLAYER_CHARACTERS;
let charSelectPersistKeys = { general: 'storyLastGeneral', vice: 'storyLastViceGenerals' };
let charSelectAllowCancel = true;
let charSelectFormation = 'attack';

function renderFormationSelect() {
  formationAttackBtn.classList.toggle('active', charSelectFormation === 'attack');
  formationDefenseBtn.classList.toggle('active', charSelectFormation === 'defense');
}
formationAttackBtn.addEventListener('click', () => {
  charSelectFormation = 'attack';
  renderFormationSelect();
});
formationDefenseBtn.addEventListener('click', () => {
  charSelectFormation = 'defense';
  renderFormationSelect();
});

function openCharacterSelect(onConfirm, opts = {}) {
  const roster = opts.roster || PLAYER_CHARACTERS;
  const persistKeys = opts.persistKeys || { general: 'storyLastGeneral', vice: 'storyLastViceGenerals' };
  charSelectFormation = profile.lastFormation === 'defense' ? 'defense' : 'attack';
  renderFormationSelect();
  charSelectOnConfirm = onConfirm;
  charSelectRoster = roster;
  charSelectPersistKeys = persistKeys;
  charSelectAllowCancel = opts.allowCancel !== false;
  characterSelectCancelBtn.hidden = !charSelectAllowCancel;
  charSelectViceLimit = opts.viceLimit ?? viceGeneralCountFor(getPlayerTotalTroops(profile));
  const defaultGeneral = profile[persistKeys.general];
  charSelectGeneral = (roster.find((c) => c.id === defaultGeneral) || roster[0])?.id || null;
  const defaultVice = profile[persistKeys.vice] || [];
  charSelectVice = new Set(defaultVice.filter((id) => id !== charSelectGeneral && roster.some((c) => c.id === id)).slice(0, charSelectViceLimit));
  renderCharacterSelect();
  characterSelectModal.hidden = false;
}

function renderCharacterSelect() {
  charSelectViceRemaining.textContent = Math.max(0, charSelectViceLimit - charSelectVice.size);
  characterSelectList.innerHTML = '';
  for (const char of charSelectRoster) {
    const isGeneral = charSelectGeneral === char.id;
    const isVice = charSelectVice.has(char.id);
    const card = document.createElement('div');
    card.className = 'character-card' + (isGeneral || isVice ? ' selected' : '');
    const rarityPrefix = char.rarity ? `<span style="color:${RARITY_COLOR[char.rarity] || '#ccc'}">${RARITY_LABEL[char.rarity]}</span> ` : '';
    card.innerHTML = `
      <img src="${getPortraitDataUrl(char.id)}" alt="" />
      <div class="character-info">
        <div class="character-name">${rarityPrefix}${char.name} <span class="hint">(${UNIT_STATS[char.type].label})</span></div>
        <div class="character-title">${char.title}</div>
        <div class="character-skill">✨${char.skillName}: ${char.skillDesc}</div>
      </div>
      <div class="character-role-buttons">
        <button type="button" class="role-btn${isGeneral ? ' active general' : ''}" data-role="general">👑大将</button>
        <button type="button" class="role-btn${isVice ? ' active vice' : ''}" data-role="vice"${charSelectViceLimit === 0 ? ' disabled' : ''}>🎖️副将</button>
      </div>
    `;
    card.querySelector('[data-role="general"]').addEventListener('click', () => {
      charSelectGeneral = char.id;
      charSelectVice.delete(char.id);
      renderCharacterSelect();
    });
    card.querySelector('[data-role="vice"]').addEventListener('click', () => {
      if (char.id === charSelectGeneral) return;
      if (charSelectVice.has(char.id)) {
        charSelectVice.delete(char.id);
      } else if (charSelectVice.size < charSelectViceLimit) {
        charSelectVice.add(char.id);
      } else {
        playSfx('error');
        return;
      }
      renderCharacterSelect();
    });
    characterSelectList.appendChild(card);
  }
}

characterSelectConfirmBtn.addEventListener('click', () => {
  profile[charSelectPersistKeys.general] = charSelectGeneral;
  profile[charSelectPersistKeys.vice] = [...charSelectVice];
  profile.lastFormation = charSelectFormation;
  saveProfile(profile);
  characterSelectModal.hidden = true;
  const cb = charSelectOnConfirm;
  charSelectOnConfirm = null;
  cb?.(charSelectGeneral, [...charSelectVice], charSelectFormation);
});
characterSelectCancelBtn.addEventListener('click', () => {
  characterSelectModal.hidden = true;
  charSelectOnConfirm = null;
});

function buildStoryDifficultyList() {
  storyDifficultyList.innerHTML = '';
  for (const diff of selectableStoryDifficulties(profile)) {
    const card = document.createElement('button');
    card.className = `story-difficulty-card ${diff.id}`;
    card.innerHTML = `<b>${diff.name}</b><span>${diff.desc}</span>`;
    card.addEventListener('click', () => {
      profile.storyDifficulty = diff.id;
      saveProfile(profile);
      storyDifficultyModal.hidden = true;
      storyPrologueText.textContent = PROLOGUE_TEXT;
      storyPrologueModal.hidden = false;
    });
    storyDifficultyList.appendChild(card);
  }
}

storyPrologueStartBtn.addEventListener('click', () => {
  storyPrologueModal.hidden = true;
  renderBattleMap();
});

storyResetBtn.addEventListener('click', () => {
  showConfirm('ストーリーモードのキャンペーンをリセットしますか?(領土・仲間になった武将・難易度などが失われ、最初からやり直せます。ジェムやガチャの武将コレクションは失われません)', () => {
    resetStoryCampaign(profile);
    saveProfile(profile);
    renderBattleMap();
  });
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
  renderSavedPassphrases();
  onlineModal.hidden = false;
});

// ---------- よく使う合言葉のお気に入り(ローカル保存のみ。アカウント基盤は使わない) ----------
const SAVED_PASSPHRASE_MAX = 10;

function renderSavedPassphrases() {
  savedPassphraseList.innerHTML = '';
  for (const code of profile.savedPassphrases || []) {
    const chip = document.createElement('div');
    chip.className = 'passphrase-chip';
    chip.dataset.code = code;
    chip.innerHTML = `<span>🔖 ${code}</span><button type="button" class="passphrase-delete-btn" data-code="${code}">×</button>`;
    savedPassphraseList.appendChild(chip);
  }
}

savedPassphraseList.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.passphrase-delete-btn');
  if (deleteBtn) {
    profile.savedPassphrases = (profile.savedPassphrases || []).filter((c) => c !== deleteBtn.dataset.code);
    saveProfile(profile);
    renderSavedPassphrases();
    return;
  }
  const chip = e.target.closest('.passphrase-chip');
  if (chip) joinWithPassphrase(chip.dataset.code);
});

onlineCodeSaveBtn.addEventListener('click', () => {
  const code = onlineCodeInput.value.trim();
  if (!code) return showOnlineError('合言葉を入力してください');
  const existing = (profile.savedPassphrases || []).filter((c) => c !== code);
  profile.savedPassphrases = [code, ...existing].slice(0, SAVED_PASSPHRASE_MAX);
  saveProfile(profile);
  renderSavedPassphrases();
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

function joinWithPassphrase(code) {
  if (!code) return showOnlineError('合言葉を入力してください');
  onlineErrorText.hidden = true;
  ensureNetClient()
    .then((client) => client.joinRoom(onlineSelectedMode, code))
    .catch(() => showOnlineError('サーバーに接続できませんでした'));
}

onlineCodeBtn.addEventListener('click', () => {
  joinWithPassphrase(onlineCodeInput.value.trim());
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
    chip.className = 'deploy-chip' + (squad.isGeneral ? ' general' : squad.isViceGeneral ? ' vice-general' : squad.isElite ? ' elite' : '') + (idx === selectedDeployIndex ? ' selected' : '');
    let icon = squad.stats.icon;
    let label = squad.stats.label;
    if (squad.isGeneral) {
      icon = `👑${squad.stats.icon}`;
      label = `大将(${squad.stats.label})`;
    } else if (squad.isViceGeneral) {
      icon = `🎖️${squad.stats.icon}`;
      label = `副将(${squad.stats.label})`;
    } else if (squad.isElite) {
      icon = `⭐${squad.stats.icon}`;
      label = `精鋭${squad.stats.label}`;
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
    icon: squad.isGeneral ? `👑${squad.stats.icon}` : squad.isViceGeneral ? `🎖️${squad.stats.icon}` : squad.isElite ? `⭐${squad.stats.icon}` : squad.stats.icon,
    label: squad.isGeneral ? `大将(${squad.stats.label})` : squad.isViceGeneral ? `副将(${squad.stats.label})` : squad.isElite ? `精鋭${squad.stats.label}` : squad.stats.label,
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
  if (game.deployQueue[myId].some((s) => s.isGeneral)) {
    // 大将が未配置のまま開戦はできない(エラー音+一時的なメッセージで知らせる)
    playSfx('error');
    vibrate(80);
    const prevText = turnIndicator.textContent;
    turnIndicator.textContent = '⚠️ 大将を配置してから配置完了してください';
    setTimeout(() => {
      if (game.phase === 'deploy') turnIndicator.textContent = prevText;
    }, 1600);
    return;
  }
  // 配置しなかった部隊はこの戦闘には連れて行かない(全軍を強制的に自動配置することはしない)
  game.deployQueue[myId] = [];
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
      showCardCutin(card);
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

// ---------- カード使用カットイン ----------
const CARD_CUTIN_THEME = {
  [UNIT_TYPES.INFANTRY]: { icon: '🛡️', label: '歩兵の秘策', c1: '#2d6a30', c2: '#7fd18a' },
  [UNIT_TYPES.ARCHER]: { icon: '🏹', label: '弓兵の秘策', c1: '#8a5a00', c2: '#ffcf5c' },
  [UNIT_TYPES.CAVALRY]: { icon: '🐎', label: '騎兵の秘策', c1: '#a83214', c2: '#ff8a5c' },
  general: { icon: '👑', label: '軍師の秘策', c1: '#3d7fd6', c2: '#7fb8ff' },
};
let cardCutinTimer = null;
function showCardCutin(card) {
  const theme = CARD_CUTIN_THEME[card.unitType] || CARD_CUTIN_THEME.general;
  cardCutinIcon.textContent = theme.icon;
  cardCutinType.textContent = theme.label;
  cardCutinName.textContent = card.name;
  cardCutinDesc.textContent = card.desc;
  cardCutinBand.style.setProperty('--cutin-c1', theme.c1);
  cardCutinBand.style.setProperty('--cutin-c2', theme.c2);
  cardCutin.hidden = true;
  void cardCutin.offsetWidth; // アニメーションを毎回リスタートさせるための強制リフロー
  cardCutin.hidden = false;
  clearTimeout(cardCutinTimer);
  cardCutinTimer = setTimeout(() => {
    cardCutin.hidden = true;
  }, 1900);
  playSfx('cardUse');
  vibrate(30);
}
cardCutin.addEventListener('pointerdown', () => {
  clearTimeout(cardCutinTimer);
  cardCutin.hidden = true;
});

// ---------- 君主セリフバナー(ストーリーモードの首都攻防戦のみ) ----------
let nationQuoteTimer = null;
function showNationQuote(nation, text) {
  if (!nation || !text) return;
  nationQuotePortrait.src = getPortraitDataUrl(nation.id);
  nationQuoteName.textContent = nation.monarch;
  nationQuoteBody.textContent = text;
  nationQuoteBanner.hidden = true;
  void nationQuoteBanner.offsetWidth;
  nationQuoteBanner.hidden = false;
  clearTimeout(nationQuoteTimer);
  nationQuoteTimer = setTimeout(() => {
    nationQuoteBanner.hidden = true;
  }, 3200);
  playSfx('select');
}
nationQuoteBanner.addEventListener('pointerdown', () => {
  clearTimeout(nationQuoteTimer);
  nationQuoteBanner.hidden = true;
});

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
    else if (s.isElite) rankPrefix = '⭐ 精鋭 ';
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
  const allowDiagonal = squad.type === UNIT_TYPES.CAVALRY;
  const touchesGroup = selection.group.some((s) => isAdjacent(s.x, s.y, squad.x, squad.y, allowDiagonal));
  if (!touchesGroup) {
    playSfx('error');
    return;
  }
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
      playSfx('move');
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

// 1000人上限の中で「何人置くか」を選べるようにする
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
    if (placeSquad(game, myId, templateIndex, x, y)) {
      selectedDeployIndex = null;
      playSfx('deploy');
    }
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
    playSfx('deploy');
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
    splitSlider.value = Math.min(max, Math.round(squad.count / 400) * MIN_ACTIVE_SOLDIERS || MIN_ACTIVE_SOLDIERS);
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
    handleStoryCombatEvent(game);
    if (isOnlineGame) broadcastState();
    showCombatModal(combat);
  } else {
    afterPlayerAction();
  }
}

// 首都攻防戦での「スキル発動時」「煽り」演出: 実際のカード使用ではなく、戦闘の節目(1戦目・2戦目)に紐付ける
// (CPUはカードを使わないため、既存の戦闘検出をそのまま流用する形にしている)
function handleStoryCombatEvent(g) {
  if (!g?.storyDialogueSet) return;
  g.storyCombatEventCount = (g.storyCombatEventCount || 0) + 1;
  if (g.storyCombatEventCount === 1) {
    showNationQuote(g.storyNation, g.storyDialogueSet.skillActivate);
  } else if (g.storyCombatEventCount === 2) {
    showNationQuote(g.storyNation, g.storyDialogueSet.taunt);
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
  playSfx(c.isRanged ? 'ranged' : 'melee');
  vibrate(c.defenderDied || c.attackerDied ? [30, 40, 30] : 20);
}

// CPU(相手)からの攻撃結果を表示し、プレイヤーが閉じるまでターン進行を待たせる
function showCombatModalAndWait(c) {
  return new Promise((resolve) => {
    combatModalResolve = resolve;
    showCombatModal(c);
  });
}

$('combat-close-btn').addEventListener('click', () => {
  combatModal.hidden = true;
  if (combatModalResolve) {
    const resolve = combatModalResolve;
    combatModalResolve = null;
    resolve();
  } else if (combatModalFromPeer) afterPeerSync();
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
    const prevCombat = game.lastCombat;
    status = cpuStepTurn(game, renderer, 'B');
    refreshDeployUI();
    render();
    const isNewCombat = !!game.lastCombat && game.lastCombat !== prevCombat;
    if (isNewCombat) {
      handleStoryCombatEvent(game);
      // 相手からの攻撃結果もプレイヤーの攻撃時と同様に表示し、閉じるまでターンを進めない
      await showCombatModalAndWait(game.lastCombat);
    }
    if (game.phase === 'over') break;
    if (!isNewCombat) {
      if (status === 'acted') await sleep(500);
      else if (status === 'passed') await sleep(80);
    }
  }
  cpuTurnRunning = false;
  if (game.phase === 'over') showResult();
}

const VICTORY_GEM_REWARD = { easy: 30, official: 50, normal: 60, large: 100, story: 80, story_defense: 40 };

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
    }
  }
  if (game.isDefenseBattle) {
    resultDesc.textContent += resolveCapitalDefenseOutcome(game, game.winner === myId);
  } else if (game.isStory) {
    resultDesc.textContent += resolveStoryBattleOutcome(game, game.winner === myId, game.winner === myId ? '勝利!' : '敗北……');
  }
  resultModal.hidden = false;
  playSfx(game.winner === myId ? 'victory' : game.winner === 'draw' ? 'error' : 'defeat');
  vibrate(game.winner === myId ? [40, 60, 40, 60, 80] : [200]);
}

// 合戦の勝敗を国盗り合戦の世界地図に反映する(勝敗を問わず、他国情勢の背景シミュレーションは進行する)
// 首都級の戦闘に勝った時、「敗北時」セリフ + 仲間になれる国なら「仲間になる時」セリフも連結し、
// profile.storyRecruitedCharacterIds に登録する(ガチャの武将コレクションとは完全に別管理)
function appendNationDefeatDialogue(nation, difficultyId, prof, includeQuotes = true) {
  if (!nation) return '';
  const dialogueSet = dialogueSetFor(nation.id, difficultyId);
  let text = includeQuotes && dialogueSet?.defeat ? ` ${nation.monarch}「${dialogueSet.defeat}」` : '';
  if (isRecruitable(nation.id, difficultyId)) {
    prof.storyRecruitedCharacterIds = prof.storyRecruitedCharacterIds || [];
    if (!prof.storyRecruitedCharacterIds.includes(nation.id)) {
      prof.storyRecruitedCharacterIds.push(nation.id);
    }
    text += includeQuotes && dialogueSet?.join
      ? ` ${nation.monarch}「${dialogueSet.join}」🤝${nation.monarch}が仲間になりました!`
      : ` 🤝${nation.monarch}が仲間になりました!`;
  }
  return text;
}

// 全土制覇(キャンペーンクリア)を検知する。ラセルの封印領土(sealed)以外がすべてplayer領有になったら、
// 通常キャンペーンならヘルモードを解放し、ヘルモード中ならラセルの封印を解く(resolveStoryBattleOutcomeの勝利時のみ呼ぶ)
function checkCampaignClear() {
  const map = profile.storyMap;
  if (!map) return '';
  const allCleared = map.owners.every((o) => o === 'player' || o === 'sealed');
  if (!allCleared) return '';
  if (profile.storyDifficulty === 'hell') {
    if (profile.laselUnsealed) return '';
    for (let i = 0; i < map.owners.length; i++) {
      if (map.tiles[i] === 'lasel' && map.owners[i] === 'sealed') map.owners[i] = 'lasel';
    }
    profile.laselUnsealed = true;
    return ' 😈大陸を統一した、その刹那——北の空を切り裂き、封じられていた漆黒の軍勢が姿を現した……隠しボス「ラセル」が解放されました!';
  }
  if (!profile.hellModeUnlocked) {
    profile.hellModeUnlocked = true;
    return ' 🎉大陸を統一しました!新たな難易度「ヘル」が解放されました。';
  }
  return '';
}

function resolveStoryBattleOutcome(finishedGame, won) {
  const map = profile.storyMap;
  const owners = map.owners;
  const nation = finishedGame.storyNation;
  const tileIndex = finishedGame.storyTileIndex;
  let text = '';

  if (won) {
    const total = totalTileCount(map, nation.id);
    const remainingBefore = remainingTileCount(map, owners, nation.id);
    const capturedCapital = isCapitalTile(map, tileIndex);
    const isLastTerritory = remainingBefore <= 1 || capturedCapital;
    const absorbed = applyStoryVictory(finishedGame, profile, isLastTerritory);
    owners[tileIndex] = 'player';

    if (capturedCapital && remainingBefore > 1) {
      playSfx('capital');
      // 首都陥落: 残りの領土もまとめて総取りする(平均駐留軍を兵種比率で概算して追加吸収する)
      let extraTilesClaimed = 0;
      for (let i = 0; i < owners.length; i++) {
        if (owners[i] === nation.id) {
          owners[i] = 'player';
          extraTilesClaimed++;
        }
      }
      const avgPerTile = effectiveNationTroops(nation, profile) / total;
      for (const type of Object.values(UNIT_TYPES)) {
        const gain = Math.round(avgPerTile * extraTilesClaimed * (nation.composition[type] || 0));
        if (gain > 0) {
          profile.storyReserve[type] = (profile.storyReserve[type] || 0) + gain;
          absorbed[type] = (absorbed[type] || 0) + gain;
        }
      }
    }

    const absorbedText = Object.entries(absorbed)
      .map(([type, n]) => `${UNIT_STATS[type].label}${n}`)
      .join('・');
    resultTitle.textContent = capturedCapital ? `${nation.monarch}の首都を陥落!` : `${nation.monarch}の守備隊を撃破!`;
    text += absorbedText ? ` 降伏兵(${absorbedText})を吸収しました。` : '';
    text += capturedCapital
      ? remainingBefore > 1
        ? ` 首都陥落により${nation.name}を総取りしました(残り${remainingBefore - 1}マスもまとめて制圧)!`
        : ` ${nation.name}を完全に平定しました!`
      : ` ${nation.name}の領土を1マス制圧しました(残り${remainingBefore - 1}/${total})。`;
    if (capturedCapital) {
      text += appendNationDefeatDialogue(nation, profile.storyDifficulty, profile);
    }
    text += checkCampaignClear();
  }

  // 領土の戦闘を5回終えるごとに世界中の国の兵力が10%強化される(勝敗を問わずカウントする)
  profile.storyBattlesCompleted = (profile.storyBattlesCompleted || 0) + 1;
  if (justCrossedWorldBoostThreshold(profile.storyBattlesCompleted)) {
    const boostPercent = Math.round((worldBoostFactor(profile) - 1) * 100);
    text += ` 🌍世界情勢が変化し、すべての国の兵力が強化されました(合計+${boostPercent}%)!`;
    playSfx('capital');
  }

  const incursions = simulateRivalIncursions(map, owners, profile.storyAlliances, findNation, worldBoostFactor(profile));
  const capitalIncursion = incursions.find((inc) => isCapitalTile(map, inc.tileIndex)) || null;
  if (capitalIncursion) {
    // 首都級のタイルへの侵犯は自動没収にせず、迎撃戦の決着がつくまで奪取を保留する
    owners[capitalIncursion.tileIndex] = 'player';
    profile.storyPendingDefense = { tileIndex: capitalIncursion.tileIndex, attackerNationId: capitalIncursion.byNation };
  }
  const flippedNames = incursions
    .filter((inc) => inc !== capitalIncursion)
    .map((inc) => findNation(inc.byNation)?.name || inc.byNation);
  if (flippedNames.length) text += ` その隙に${flippedNames.join('・')}が領土を侵犯してきました!`;
  if (capitalIncursion) {
    const attackerName = findNation(capitalIncursion.byNation)?.name || capitalIncursion.byNation;
    const isNativeCapital = map.tiles[capitalIncursion.tileIndex] === PLAYER_NATION.id;
    text += ` ⚔️${attackerName}が${isNativeCapital ? '黎明の王都' : '拠点'}に攻め込んできています!迎撃が必要です。`;
  }

  const difficulty = findDifficulty(profile.storyDifficulty);
  const powerEvent = simulateGreatPowerDynamics(map, owners, difficulty.worldEvent);
  if (powerEvent?.type === 'ally_and_crush') {
    const victimName = findNation(powerEvent.victim)?.name || powerEvent.victim;
    const conquerorName = findNation(powerEvent.conqueror)?.name || powerEvent.conqueror;
    text += ` 世界情勢: ${conquerorName}が${victimName}の領土を飲み込みました。`;
  } else if (powerEvent?.type === 'infighting') {
    const loserName = findNation(powerEvent.loser)?.name || powerEvent.loser;
    const winnerName = findNation(powerEvent.winner)?.name || powerEvent.winner;
    text += ` 世界情勢: ${winnerName}と${loserName}が争い、${loserName}の領土の一部が無主地になりました。`;
  }

  saveProfile(profile);
  return text;
}

// 拠点防衛戦の勝敗を反映する。勝利時は保留していた奪取をキャンセルするだけ、敗北時はタイルを
// 確定譲渡した上で出陣武将をこのキャンペーン中ロストさせる(自国の王都なら即キャンペーン終了)
function resolveCapitalDefenseOutcome(finishedGame, won) {
  const { defenseTileIndex: tileIndex, defenseAttackerNationId: attackerNationId, defenseIsNativeCapital: isNativeCapital } = finishedGame;
  const attackerName = findNation(attackerNationId)?.name || attackerNationId;

  if (won) {
    let text = ` ${attackerName}の猛攻を凌ぎきり、拠点の防衛に成功しました!`;
    text += appendNationDefeatDialogue(findNation(attackerNationId), profile.storyDifficulty, profile, false);
    saveProfile(profile);
    return text;
  }

  if (profile.storyMap) profile.storyMap.owners[tileIndex] = attackerNationId;
  const lostIds = [finishedGame.defenseGeneralId, ...(finishedGame.defenseViceIds || [])].filter(Boolean);
  profile.storyLostCharacterIds = profile.storyLostCharacterIds || [];
  for (const id of lostIds) {
    if (!profile.storyLostCharacterIds.includes(id)) profile.storyLostCharacterIds.push(id);
  }

  let text;
  if (isNativeCapital) {
    resultTitle.textContent = '王都陥落……';
    text = ` ${attackerName}に黎明の王都を攻め落とされました。このキャンペーンは終了します……新たな国盗りを始めましょう。`;
    resetStoryCampaign(profile);
  } else {
    text = ` ${attackerName}に拠点を奪われました。出陣した武将はこのキャンペーン中、大将・副将として選べなくなります。`;
  }
  saveProfile(profile);
  return text;
}

$('restart-btn').addEventListener('click', () => {
  resultModal.hidden = true;
  leaveOnlineGame();
  if (profile.storyPendingDefense) {
    showScreen('menu');
    showCapitalDefensePrompt();
    return;
  }
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

// ---------- 初回チュートリアル(スキップ可) ----------
const TUTORIAL_SLIDES = [
  { emoji: '⚔️', title: 'Square VSへようこそ', body: '兵を分けたり束ねたりしながら、盤面のマスを制圧していく対戦ゲームです。まずは基本の流れをサクッと確認しましょう。' },
  { emoji: '🚩', title: '配置フェーズ', body: '対戦が始まったら、自分の陣地に部隊をドラッグして配置します。「ランダム自動配置」で一気に済ませることもできます。' },
  { emoji: '👉', title: '移動・攻撃', body: '部隊をタップして選択すると、移動・攻撃できるマスが光ります。行き先や敵部隊をタップして実行しましょう。' },
  { emoji: '🔺', title: '三すくみ', body: '歩兵 > 騎兵 > 弓兵 > 歩兵 の相性関係があります。有利な兵種をぶつけて戦いを優位に進めましょう。' },
  { emoji: '🌲', title: '地形の活用', body: '丘・山にいる部隊は防御が有利に。林にいる部隊は敵から兵種が見えなくなり、奇襲のチャンスになります。' },
  { emoji: '✂️', title: '分隊・統合', body: '「分隊」で兵を分けて多方面に展開できます。同じ兵種の部隊同士は隣接させるだけで自動的に統合されます。' },
  { emoji: '👑', title: '勝利条件', body: '敵の大将を討ち取れば勝利!全部隊が行動し終えると自動的に相手の番になります。それでは早速遊んでみましょう!' },
];
let tutorialIndex = 0;
let tutorialOnDone = null;

function renderTutorialSlide() {
  const slide = TUTORIAL_SLIDES[tutorialIndex];
  tutorialTitle.textContent = slide.title;
  tutorialBody.innerHTML = `<div class="tutorial-emoji">${slide.emoji}</div><p>${slide.body}</p>`;
  tutorialDots.innerHTML = TUTORIAL_SLIDES.map((_, i) => `<span class="${i === tutorialIndex ? 'active' : ''}"></span>`).join('');
  tutorialNextBtn.textContent = tutorialIndex === TUTORIAL_SLIDES.length - 1 ? 'はじめる!' : '次へ';
}

function openTutorial(onDone = null) {
  tutorialIndex = 0;
  tutorialOnDone = onDone;
  renderTutorialSlide();
  tutorialModal.hidden = false;
}

function closeTutorial() {
  tutorialModal.hidden = true;
  if (!profile.tutorialSeen) {
    profile.tutorialSeen = true;
    saveProfile(profile);
  }
  const cb = tutorialOnDone;
  tutorialOnDone = null;
  cb?.();
}

tutorialNextBtn.addEventListener('click', () => {
  if (tutorialIndex < TUTORIAL_SLIDES.length - 1) {
    tutorialIndex++;
    renderTutorialSlide();
  } else {
    closeTutorial();
  }
});
tutorialSkipBtn.addEventListener('click', closeTutorial);
tutorialBtn.addEventListener('click', () => openTutorial());

// ---------- ジェム・ショップ(実際の課金は行わないシミュレーション) ----------
function updateGemDisplay() {
  gemCountEl.textContent = `💎 ${profile.gems}`;
  shopGemCountEl.textContent = `💎 ${profile.gems}`;
  updateHomeStatsStrip();
}

// ホーム画面(バトルタブ)冒頭の簡易ステータス帯(ログイン継続・図鑑・ストーリー進行度)を更新する
function updateHomeStatsStrip() {
  homeStatStreakEl.textContent = profile.loginStreak > 0 ? `${profile.loginStreak}日連続` : '-';
  homeStatCollectionEl.textContent = `${profile.unlockedCharacters.length}/${CHARACTER_CARDS.length}`;
  if (profile.storyDifficulty) {
    const difficulty = findDifficulty(profile.storyDifficulty);
    const recruited = profile.storyRecruitedCharacterIds?.length || 0;
    homeStatStoryEl.textContent = `${difficulty.name} 仲間${recruited}人`;
  } else {
    homeStatStoryEl.textContent = '未プレイ';
  }
}

// 「能力値順」ソート用の派生値(兵種の基礎ランク + レアリティのランクボーナス)
function characterPower(char) {
  return UNIT_STATS[char.type].rank + (RARITY_RANK_BONUS[char.rarity] || 0);
}

// コンパクトなアイコン+色付き★のみのタイル。詳細情報は長押しで#character-detail-modalに表示する
function buildCharacterTile(char) {
  const count = profile.characterCardCounts[char.id] || 0;
  const unlocked = profile.unlockedCharacters.includes(char.id);
  const bonus = characterCollectionBonus(count);
  const tile = document.createElement('div');
  tile.className = 'char-tile' + (bonus > 0 ? ' enhanced' : unlocked ? ' unlocked' : ' locked-row');
  tile.dataset.charId = char.id;
  tile.innerHTML = `
    <img src="${getPortraitDataUrl(char.id)}" alt="" />
    <span class="char-tile-stars" style="color:${RARITY_COLOR[char.rarity] || '#ccc'}">${RARITY_LABEL[char.rarity]}</span>
    <span class="char-tile-count">${count}枚</span>
  `;
  return tile;
}

// 汎用の長押し検出(盤面のInputControllerとは別に、プレーンなDOMリスト向けの軽量版)
function attachLongPress(container, selector, onLongPress, ms = 450) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  const TOLERANCE = 8;
  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  container.addEventListener('pointerdown', (e) => {
    const target = e.target.closest(selector);
    if (!target) return;
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      timer = null;
      onLongPress(target);
    }, ms);
  });
  container.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > TOLERANCE || Math.abs(e.clientY - startY) > TOLERANCE) clear();
  });
  container.addEventListener('pointerup', clear);
  container.addEventListener('pointercancel', clear);
  container.addEventListener('pointerleave', clear);
}

function showCharacterDetail(char) {
  const count = profile.characterCardCounts[char.id] || 0;
  const unlocked = profile.unlockedCharacters.includes(char.id);
  const bonus = characterCollectionBonus(count);
  characterDetailPortrait.src = getPortraitDataUrl(char.id);
  characterDetailName.textContent = char.name;
  characterDetailTitle.textContent = `${char.title}(${UNIT_STATS[char.type].label})`;
  characterDetailStars.textContent = RARITY_LABEL[char.rarity];
  characterDetailStars.style.color = RARITY_COLOR[char.rarity] || '#ccc';
  characterDetailStatus.textContent = unlocked
    ? `🤝仲間${bonus > 0 ? `(+${bonus})` : ''} 所持${count}枚`
    : `未仲間(あと${CHARACTER_GACHA_UNLOCK_COUNT - count}枚) 所持${count}枚`;
  characterDetailRate.textContent = `出現確率 ${(characterDropRate(char) * 100).toFixed(2)}%`;
  characterDetailModal.hidden = false;
}
characterDetailCloseBtn.addEventListener('click', () => {
  characterDetailModal.hidden = true;
});
attachLongPress(collectionList, '.char-tile', (tile) => {
  const char = findCharacterCard(tile.dataset.charId);
  if (char) showCharacterDetail(char);
});
attachLongPress(collectionFeaturedList, '.char-tile', (tile) => {
  const char = findCharacterCard(tile.dataset.charId);
  if (char) showCharacterDetail(char);
});

function refreshShopUI() {
  updateGemDisplay();

  const ten_cost = profile.characterGacha10Used ? CHARACTER_GACHA_TEN_COST : CHARACTER_GACHA_TEN_FIRST_COST;
  characterGachaCostEl.textContent = CHARACTER_GACHA_COST;
  characterGacha10CostEl.textContent = ten_cost;
  characterGachaBtn.disabled = profile.gems < CHARACTER_GACHA_COST;
  characterGacha10Btn.disabled = profile.gems < ten_cost;
  characterGachaFirstHint.hidden = !!profile.characterGacha10Used;
  collectionSummaryEl.textContent = `所持キャラ: ${profile.unlockedCharacters.length} / ${CHARACTER_CARDS.length}`;

  const banner = getActivePickupBanner();
  pickupGachaSection.hidden = !banner;
  if (banner) {
    pickupBannerTitle.textContent = banner.title;
    pickupBannerPortraits.innerHTML = banner.featuredCharacterIds
      .map((id) => {
        const c = findCharacterCard(id);
        return c ? `<div class="pickup-portrait"><img src="${getPortraitDataUrl(id)}" alt="" /><span>${c.name}</span></div>` : '';
      })
      .join('');
    pickupGachaCostEl.textContent = CHARACTER_GACHA_COST;
    pickupGacha10CostEl.textContent = ten_cost;
    pickupGachaBtn.disabled = profile.gems < CHARACTER_GACHA_COST;
    pickupGacha10Btn.disabled = profile.gems < ten_cost;
    pickupGachaFirstHint.hidden = !!profile.characterGacha10Used;
  }
}

// ---------- 下部タブ付きホーム画面(バトル・カード・ショップ・ガチャ) ----------
const HOME_PAGE_NAMES = ['battle', 'cards', 'shop', 'gacha'];
function scrollHomePagerTo(pageName) {
  const idx = HOME_PAGE_NAMES.indexOf(pageName);
  const page = homePager.children[idx];
  if (!page) return;
  homePager.scrollTo({ left: page.offsetLeft, behavior: 'smooth' });
}
function updateHomeTabActive() {
  const center = homePager.scrollLeft + homePager.clientWidth / 2;
  let closest = 0;
  let closestDist = Infinity;
  [...homePager.children].forEach((page, i) => {
    const pageCenter = page.offsetLeft + page.clientWidth / 2;
    const d = Math.abs(pageCenter - center);
    if (d < closestDist) {
      closestDist = d;
      closest = i;
    }
  });
  const pageName = HOME_PAGE_NAMES[closest];
  for (const btn of homeTabBtns) btn.classList.toggle('active', btn.dataset.page === pageName);
  if (pageName === 'shop' || pageName === 'gacha') refreshShopUI();
  if (pageName === 'cards') {
    renderFeaturedCharacters();
    renderCollection();
  }
  if (pageName === 'battle') renderBattleMap();
}
let homePagerScrollTimer = null;
homePager.addEventListener('scroll', () => {
  clearTimeout(homePagerScrollTimer);
  homePagerScrollTimer = setTimeout(updateHomeTabActive, 60);
});
for (const btn of homeTabBtns) {
  btn.addEventListener('click', () => scrollHomePagerTo(btn.dataset.page));
}

openCollectionBtn.addEventListener('click', () => scrollHomePagerTo('cards'));

// ---------- 武将図鑑(獲得したカードの一覧・並べ替え・絞り込み) ----------
const ALL_NATIONS_FOR_FILTER = [PLAYER_NATION, ...STORY_NATIONS];
for (const n of ALL_NATIONS_FOR_FILTER) {
  const opt = document.createElement('option');
  opt.value = n.id;
  opt.textContent = n.name;
  collectionFilterNation.appendChild(opt);
}

for (const el of [collectionSort, collectionFilterStatus, collectionFilterRarity, collectionFilterType, collectionFilterNation]) {
  el.addEventListener('change', renderCollection);
}

// ---------- 出陣メンバーの事前設定(大将1人+副将2人まで。カードタブから直接編集できる) ----------
// profile.storyLastGeneral/storyLastViceGenerals にそのまま保存する(character-select-modalが
// デフォルト選択として読む値と全く同じフィールドなので、戦闘開始フローは一切変更しなくてよい)
const LINEUP_VICE_LIMIT = 2;

function renderLineupEditor() {
  const roster = storyCharacterRoster();
  const general = roster.find((c) => c.id === profile.storyLastGeneral)?.id || roster[0]?.id || null;
  const vice = new Set(
    (profile.storyLastViceGenerals || [])
      .filter((id) => id !== general && roster.some((c) => c.id === id))
      .slice(0, LINEUP_VICE_LIMIT)
  );
  profile.storyLastGeneral = general;
  profile.storyLastViceGenerals = [...vice];

  lineupEditorList.innerHTML = '';
  for (const char of roster) {
    const isGeneral = general === char.id;
    const isVice = vice.has(char.id);
    const card = document.createElement('div');
    card.className = 'character-card' + (isGeneral || isVice ? ' selected' : '');
    card.innerHTML = `
      <img src="${getPortraitDataUrl(char.id)}" alt="" />
      <div class="character-info">
        <div class="character-name">${char.name} <span class="hint">(${UNIT_STATS[char.type].label})</span></div>
        <div class="character-title">${char.title}</div>
      </div>
      <div class="character-role-buttons">
        <button type="button" class="role-btn general${isGeneral ? ' active' : ''}" data-role="general" data-id="${char.id}">👑大将</button>
        <button type="button" class="role-btn vice${isVice ? ' active' : ''}" data-role="vice" data-id="${char.id}"${!isVice && vice.size >= LINEUP_VICE_LIMIT ? ' disabled' : ''}>🎖️副将</button>
      </div>
    `;
    lineupEditorList.appendChild(card);
  }
}

lineupEditorList.addEventListener('click', (e) => {
  const btn = e.target.closest('.role-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const vice = new Set(profile.storyLastViceGenerals || []);
  if (btn.dataset.role === 'general') {
    if (profile.storyLastGeneral === id) return;
    profile.storyLastGeneral = id;
    vice.delete(id);
  } else {
    if (id === profile.storyLastGeneral) return;
    if (vice.has(id)) vice.delete(id);
    else if (vice.size < LINEUP_VICE_LIMIT) vice.add(id);
  }
  profile.storyLastViceGenerals = [...vice];
  saveProfile(profile);
  renderLineupEditor();
});

// ---------- ストーリー武将カード(常設4人+首都陥落で仲間になる8ヶ国) ----------
const STORY_RECRUITABLE_NATION_IDS = STORY_NATIONS.filter((n) => n.id !== 'haga').map((n) => n.id);
function renderStoryCards() {
  storyCardsList.innerHTML = '';
  for (const char of PLAYER_CHARACTERS) {
    storyCardsList.appendChild(buildStoryCharacterCard(char, PLAYER_NATION.color, true));
  }
  for (const nationId of STORY_RECRUITABLE_NATION_IDS) {
    const char = recruitableCharacterFor(nationId);
    if (!char) continue;
    const nation = findNation(nationId);
    const unlocked = (profile.storyRecruitedCharacterIds || []).includes(nationId);
    storyCardsList.appendChild(buildStoryCharacterCard(char, nation?.color, unlocked));
  }
}
function buildStoryCharacterCard(char, color, unlocked) {
  const card = document.createElement('div');
  card.className = 'character-card story-nation-card' + (unlocked ? '' : ' locked-card');
  card.style.setProperty('--nation-color', color || '#ddd');
  card.innerHTML = `
    <img src="${getPortraitDataUrl(char.id)}" alt="" />
    <div class="character-info">
      <div class="character-name">${char.name} <span class="hint">(${UNIT_STATS[char.type].label})</span></div>
      <div class="character-title">${char.title}</div>
      <div class="character-skill">✨${char.skillName}: ${char.skillDesc}</div>
    </div>
    <span class="character-status${unlocked ? ' unlocked' : ''}">${unlocked ? '🤝仲間' : '未仲間'}</span>
  `;
  return card;
}

function renderCollection() {
  const sortKey = collectionSort.value;
  const filterStatus = collectionFilterStatus.value;
  const filterRarity = collectionFilterRarity.value;
  const filterType = collectionFilterType.value;
  const filterNation = collectionFilterNation.value;

  let list = CHARACTER_CARDS.filter((char) => {
    const unlocked = profile.unlockedCharacters.includes(char.id);
    if (filterStatus === 'owned' && !unlocked) return false;
    if (filterStatus === 'locked' && unlocked) return false;
    if (filterRarity && char.rarity !== Number(filterRarity)) return false;
    if (filterType && char.type !== filterType) return false;
    if (filterNation && char.nationId !== filterNation) return false;
    return true;
  });

  list = list.slice().sort((a, b) => {
    if (sortKey === 'count') return (profile.characterCardCounts[b.id] || 0) - (profile.characterCardCounts[a.id] || 0);
    if (sortKey === 'name') return a.name.localeCompare(b.name, 'ja');
    if (sortKey === 'type') return a.type.localeCompare(b.type) || b.rarity - a.rarity;
    if (sortKey === 'rate') return characterDropRate(b) - characterDropRate(a);
    if (sortKey === 'power') return characterPower(b) - characterPower(a);
    return b.rarity - a.rarity || (profile.characterCardCounts[b.id] || 0) - (profile.characterCardCounts[a.id] || 0);
  });

  collectionCountSummary.textContent = `${list.length}件 / 全${CHARACTER_CARDS.length}件`;
  collectionList.innerHTML = '';
  for (const char of list) {
    collectionList.appendChild(buildCharacterTile(char));
  }
}

function renderFeaturedCharacters() {
  collectionFeaturedList.innerHTML = '';
  const featured = CHARACTER_CARDS.filter((c) => c.rarity === 5);
  for (const char of featured) {
    const tile = buildCharacterTile(char);
    tile.classList.add('featured-card');
    collectionFeaturedList.appendChild(tile);
  }
}

// ---------- 武将カードガチャの演出(カプセルをタップして開封し、レアリティに応じた光の演出で結果を見せる) ----------
const RARITY_COLOR = { 5: '#ffb300', 4: '#c77dff', 3: '#4ea8de', 2: '#7fd18a', 1: '#bbbbbb' };
let gachaQueue = [];
let gachaQueueIndex = 0;

function pullCharacterGachaOnce(banner = null) {
  const won = banner ? pickWeightedCharacterCardForBanner(banner) : pickWeightedCharacterCard(CHARACTER_CARDS);
  const wasUnlocked = profile.unlockedCharacters.includes(won.id);
  const bonusBefore = characterCollectionBonus(profile.characterCardCounts[won.id] || 0);
  profile.characterCardCounts[won.id] = (profile.characterCardCounts[won.id] || 0) + 1;
  const count = profile.characterCardCounts[won.id];
  const bonusAfter = characterCollectionBonus(count);
  const justUnlocked = !wasUnlocked && count >= CHARACTER_GACHA_UNLOCK_COUNT;
  const justBoosted = bonusAfter > bonusBefore;
  if (justUnlocked) profile.unlockedCharacters.push(won.id);
  return { char: won, count, justUnlocked, justBoosted, bonus: bonusAfter };
}

characterGachaBtn.addEventListener('click', () => {
  if (!spendGems(profile, CHARACTER_GACHA_COST)) return;
  const result = pullCharacterGachaOnce();
  saveProfile(profile);
  refreshShopUI();
  startGachaPullSequence([result]);
});

characterGacha10Btn.addEventListener('click', () => {
  const cost = profile.characterGacha10Used ? CHARACTER_GACHA_TEN_COST : CHARACTER_GACHA_TEN_FIRST_COST;
  if (!spendGems(profile, cost)) return;
  profile.characterGacha10Used = true;
  const results = [];
  for (let i = 0; i < 10; i++) results.push(pullCharacterGachaOnce());
  saveProfile(profile);
  refreshShopUI();
  startGachaPullSequence(results);
});

pickupGachaBtn.addEventListener('click', () => {
  const banner = getActivePickupBanner();
  if (!banner || !spendGems(profile, CHARACTER_GACHA_COST)) return;
  const result = pullCharacterGachaOnce(banner);
  saveProfile(profile);
  refreshShopUI();
  startGachaPullSequence([result]);
});

pickupGacha10Btn.addEventListener('click', () => {
  const banner = getActivePickupBanner();
  if (!banner) return;
  const cost = profile.characterGacha10Used ? CHARACTER_GACHA_TEN_COST : CHARACTER_GACHA_TEN_FIRST_COST;
  if (!spendGems(profile, cost)) return;
  profile.characterGacha10Used = true;
  const results = [];
  for (let i = 0; i < 10; i++) results.push(pullCharacterGachaOnce(banner));
  saveProfile(profile);
  refreshShopUI();
  startGachaPullSequence(results);
});

function startGachaPullSequence(results) {
  gachaQueue = results;
  gachaQueueIndex = 0;
  gachaSummary.hidden = true;
  gachaPullModal.hidden = false;
  showNextCapsule();
}

function updateGachaProgress() {
  gachaPullProgress.textContent = gachaQueue.length > 1 ? `${gachaQueueIndex + 1} / ${gachaQueue.length}` : '';
}

function showNextCapsule() {
  updateGachaProgress();
  gachaRevealCard.hidden = true;
  gachaCapsule.hidden = false;
  gachaPullNextBtn.hidden = true;
  gachaPullCloseBtn.hidden = true;
  gachaPullSkipBtn.hidden = gachaQueue.length <= 1;
}

gachaCapsule.addEventListener('click', () => {
  gachaCapsule.classList.add('opening');
  playSfx('tap');
  setTimeout(() => {
    gachaCapsule.classList.remove('opening');
    revealCurrentCard();
  }, 260);
});

function revealCurrentCard() {
  const { char, count, justUnlocked, justBoosted, bonus } = gachaQueue[gachaQueueIndex];
  gachaCapsule.hidden = true;
  gachaRevealCard.style.setProperty('--rarity-color', RARITY_COLOR[char.rarity] || '#ccc');
  gachaRevealPortrait.src = getPortraitDataUrl(char.id);
  gachaRevealRarity.textContent = RARITY_LABEL[char.rarity];
  gachaRevealRarity.style.color = RARITY_COLOR[char.rarity] || '#ccc';
  gachaRevealName.textContent = char.name;
  gachaRevealTitle.textContent = char.title;
  gachaRevealSkill.textContent = `✨${char.skillName}: ${char.skillDesc}`;
  const remainToNextBoost = CHARACTER_GACHA_STEP - (count % CHARACTER_GACHA_STEP || CHARACTER_GACHA_STEP);
  gachaRevealMilestone.textContent = justBoosted
    ? `⭐能力アップ!(追加ランク+${bonus})`
    : justUnlocked
      ? '🤝仲間になりました!'
      : `次の能力アップまであと${remainToNextBoost}枚`;
  gachaRevealCard.hidden = false;
  // アニメーションを毎回リスタートさせるための強制リフロー
  gachaRevealCard.style.animation = 'none';
  void gachaRevealCard.offsetWidth;
  gachaRevealCard.style.animation = '';

  const isLast = gachaQueueIndex >= gachaQueue.length - 1;
  gachaPullSkipBtn.hidden = isLast || gachaQueue.length <= 1;
  gachaPullNextBtn.hidden = false;
  gachaPullNextBtn.textContent = isLast ? (gachaQueue.length > 1 ? '結果一覧へ' : '閉じる') : '次へ';
  gachaPullCloseBtn.hidden = true;

  playSfx(char.rarity >= 4 ? 'capital' : justUnlocked || justBoosted ? 'cardUse' : 'tap');
  vibrate(char.rarity >= 4 ? [30, 40, 30] : 20);
}

gachaPullNextBtn.addEventListener('click', () => {
  if (gachaQueueIndex >= gachaQueue.length - 1) {
    finishGachaSequence();
  } else {
    gachaQueueIndex++;
    showNextCapsule();
  }
});

gachaPullSkipBtn.addEventListener('click', () => {
  finishGachaSequence();
});

gachaPullCloseBtn.addEventListener('click', () => {
  gachaPullModal.hidden = true;
});

function finishGachaSequence() {
  if (gachaQueue.length <= 1) {
    gachaPullModal.hidden = true;
    return;
  }
  gachaCapsule.hidden = true;
  gachaRevealCard.hidden = true;
  gachaPullProgress.textContent = '';
  gachaSummaryGrid.innerHTML = '';
  gachaQueue.forEach((result, i) => {
    const { char, justUnlocked } = result;
    const item = document.createElement('div');
    item.className = 'gacha-summary-item' + (justUnlocked ? ' gacha-new' : '');
    item.style.setProperty('--rarity-color', RARITY_COLOR[char.rarity] || '#ccc');
    item.style.animationDelay = `${i * 0.05}s`;
    item.innerHTML = `
      <img src="${getPortraitDataUrl(char.id)}" alt="" />
      <span class="gacha-summary-rarity" style="color:${RARITY_COLOR[char.rarity] || '#ccc'}">${RARITY_LABEL[char.rarity]}</span>
      <span class="gacha-summary-name">${char.name}</span>
    `;
    gachaSummaryGrid.appendChild(item);
  });
  gachaSummary.hidden = false;
  gachaPullNextBtn.hidden = true;
  gachaPullSkipBtn.hidden = true;
  gachaPullCloseBtn.hidden = false;
  playSfx('victory');
}

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
  gachaPullModal,
  capitalDefenseModal,
  storyPrologueModal,
  loginBonusModal,
  tutorialModal,
  cpuModePanel,
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
  if (tutorialModal && !tutorialModal.hidden) {
    closeTutorial();
    return true;
  }
  if (cpuModePanel && !cpuModePanel.hidden) {
    cpuModePanel.hidden = true;
    topModeList.hidden = false;
    return true;
  }
  const overlays = [
    gachaPullModal,
    capitalDefenseModal,
    storyPrologueModal,
    loginBonusModal,
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

// ---------- サウンド(効果音) ----------
setMuted(!!profile.muted);
updateMuteButton();
function updateMuteButton() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  profile.muted = isMuted();
  saveProfile(profile);
  updateMuteButton();
  if (!isMuted()) playSfx('tap');
});
// ブラウザの自動再生制限のため、最初のユーザー操作でAudioContextを起動する
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ボタン類のタップに軽い効果音をまとめて付ける(個別配線が必要な操作は上で別途鳴らしている)
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.btn, .top-mode-card, .mode-card, .icon-btn, .story-difficulty-card, .story-map-tile, .card-chip')) {
    playSfx('tap');
  }
});

// ---------- 開発者モード(テストプレイ用の裏設定。実際の課金・通信には一切影響しない) ----------
function cloneDefault(key) {
  const v = DEFAULT_PROFILE[key];
  if (Array.isArray(v)) return [...v];
  if (v && typeof v === 'object') return { ...v };
  return v;
}

devCodeSubmitBtn.addEventListener('click', () => {
  if (devCodeInput.value !== DEV_CODE) {
    devCodeInput.value = '';
    return;
  }
  devCodeInput.value = '';
  profile.devModeUnlocked = true;
  saveProfile(profile);
  devPanel.hidden = false;
});

devResetStoryBtn.addEventListener('click', () => {
  showConfirm('[開発者モード] ストーリーキャンペーンをリセットしますか?', () => {
    resetStoryCampaign(profile);
    saveProfile(profile);
    renderBattleMap();
  });
});
devResetGachaBtn.addEventListener('click', () => {
  showConfirm('[開発者モード] ガチャ・武将コレクションをリセットしますか?', () => {
    profile.characterCardCounts = cloneDefault('characterCardCounts');
    profile.unlockedCharacters = cloneDefault('unlockedCharacters');
    profile.characterGacha10Used = cloneDefault('characterGacha10Used');
    saveProfile(profile);
    refreshShopUI();
  });
});
devResetCpuBtn.addEventListener('click', () => {
  showConfirm('[開発者モード] 通常CPU対戦設定をリセットしますか?', () => {
    profile.useCardsInCpuBattle = cloneDefault('useCardsInCpuBattle');
    profile.cpuLastGeneral = cloneDefault('cpuLastGeneral');
    profile.cpuLastViceGenerals = cloneDefault('cpuLastViceGenerals');
    saveProfile(profile);
  });
});
devResetMiscBtn.addEventListener('click', () => {
  showConfirm('[開発者モード] チュートリアル/ログインボーナスをリセットしますか?', () => {
    profile.tutorialSeen = cloneDefault('tutorialSeen');
    profile.lastLoginDate = cloneDefault('lastLoginDate');
    profile.loginStreak = cloneDefault('loginStreak');
    saveProfile(profile);
  });
});
devResetAllBtn.addEventListener('click', () => {
  showConfirm('[開発者モード] 全データを完全リセットしますか?(開発者モードの解除状態のみ維持されます)', () => {
    Object.keys(DEFAULT_PROFILE).forEach((key) => {
      if (key === 'devModeUnlocked') return;
      profile[key] = cloneDefault(key);
    });
    saveProfile(profile);
    updateGemDisplay();
    refreshShopUI();
    renderBattleMap();
  });
});

devGemsApplyBtn.addEventListener('click', () => {
  const value = Math.max(0, Math.round(Number(devGemsInput.value)) || 0);
  profile.gems = value;
  saveProfile(profile);
  updateGemDisplay();
});

devReserveApplyBtn.addEventListener('click', () => {
  const infantry = Math.max(0, Math.round(Number(devReserveInfantryInput.value)) || 0);
  const archer = Math.max(0, Math.round(Number(devReserveArcherInput.value)) || 0);
  const cavalry = Math.max(0, Math.round(Number(devReserveCavalryInput.value)) || 0);
  profile.storyReserve = { infantry, archer, cavalry };
  saveProfile(profile);
  if (profile.storyMap) {
    storyReserveEl.textContent = `予備兵力: 歩兵${infantry} / 弓兵${archer} / 騎兵${cavalry}`;
  }
});

if (profile.devModeUnlocked) devPanel.hidden = false;

// ---------- 初期化 ----------
buildMenu();
showScreen('menu');
updateHomeTabActive();
registerServiceWorker();
updateGemDisplay();
initSplash();

function initSplash() {
  let splashDone = false;
  const finishSplash = () => {
    if (splashDone) return;
    splashDone = true;
    splashScreen.classList.add('closing');
    menuScreen.classList.add('menu-enter');
    setTimeout(() => {
      splashScreen.hidden = true;
    }, 400);
    // 初回起動時はまずチュートリアルを見せ、閉じてからログインボーナスを表示する
    if (!profile.tutorialSeen) {
      openTutorial(() => showLoginBonusIfAny());
    } else {
      showLoginBonusIfAny();
    }
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







