// ストーリーモードの「世界地図」生成・領有・隣接判定ロジック。
// 各国の領土マス数は総兵力÷4000(繰り上げ)。1マスあたりおよそ4000人の駐留軍として扱う。
import { STORY_NATIONS, PLAYER_NATION } from './story.js';

export const MAP_WIDTH = 9;
export const MAP_HEIGHT = 7;
const TROOPS_PER_TILE = 4000;

// 初回プレイヤー全員に共通の固定初期マップ、2周目以降はこの中からランダムに1つ選ぶ
export const STARTER_MAP_SEED = 20260710;
export const RANDOM_MAP_SEEDS = Array.from({ length: 30 }, (_, i) => 100000 + i * 7919);

// 軽量な決定論的PRNG(mulberry32)。同じseedなら常に同じ乱数列を返すため、
// 地図生成アルゴリズム自体は変えずに「固定の初期マップ」「30通りのランダムマップ」を再現できる
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tileCountForTroops(totalTroops) {
  return Math.max(1, Math.ceil(totalTroops / TROOPS_PER_TILE));
}

function idx(x, y) {
  return y * MAP_WIDTH + x;
}

// 国ごとの陣取り塊(ブロブ)を盤面にランダム生成する。地形生成のforestブロブ生成と同じ考え方。
function growBlob(tiles, nationId, targetSize, rng) {
  const empty = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!tiles[idx(x, y)]) empty.push([x, y]);
    }
  }
  if (!empty.length) return;
  const [sx, sy] = empty[Math.floor(rng() * empty.length)];
  const frontier = [[sx, sy]];
  const visited = new Set();
  let placed = 0;
  while (frontier.length && placed < targetSize) {
    const i = Math.floor(rng() * frontier.length);
    const [x, y] = frontier.splice(i, 1)[0];
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
    if (tiles[idx(x, y)]) continue;
    tiles[idx(x, y)] = nationId;
    placed++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && !tiles[idx(nx, ny)]) {
        frontier.push([nx, ny]);
      }
    }
  }
}

// プレイヤーの本拠地は、必ずどこかの国と隣接するマスから配置する
// (孤立したマスに置かれると、隣接国が1つもなく詰んでしまうため)
function placeAdjacentToExisting(tiles, nationId, targetSize, rng) {
  const candidates = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (tiles[idx(x, y)]) continue;
      const touchesNation = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && tiles[idx(nx, ny)];
      });
      if (touchesNation) candidates.push([x, y]);
    }
  }
  if (!candidates.length) {
    growBlob(tiles, nationId, targetSize, rng); // 万一隣接候補がなければ通常のブロブ生成にフォールバック
    return;
  }
  const [sx, sy] = candidates[Math.floor(rng() * candidates.length)];
  tiles[idx(sx, sy)] = nationId;
  let placed = 1;
  const frontier = [[sx, sy]];
  const visited = new Set([`${sx},${sy}`]);
  while (frontier.length && placed < targetSize) {
    const [x, y] = frontier.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT || visited.has(key)) continue;
      visited.add(key);
      if (tiles[idx(nx, ny)]) continue;
      tiles[idx(nx, ny)] = nationId;
      placed++;
      frontier.push([nx, ny]);
      if (placed >= targetSize) break;
    }
  }
}

// 世界地図を新規生成する(キャンペーン開始時に1回だけ呼び、プロフィールに保存して固定する)。
// seedを渡すと決定論的に(同じseedなら常に同じ地図に)、省略時は従来通りその場の乱数で生成する
export function generateWorldMap(seed) {
  const rng = seed != null ? mulberry32(seed) : Math.random;
  const tiles = new Array(MAP_WIDTH * MAP_HEIGHT).fill(null);

  // 隠しボス国(ラセル)は通常の陣取りには参加させず、地図最上段(y=0)に固定で予約しておく。
  // ヘルモード制覇まではownersを'sealed'にして封印しておく(下記)
  const hiddenBoss = STORY_NATIONS.find((n) => n.isHiddenBoss);
  if (hiddenBoss) {
    for (let x = 0; x < MAP_WIDTH; x++) tiles[idx(x, 0)] = hiddenBoss.id;
  }

  const others = STORY_NATIONS.filter((n) => !n.isHiddenBoss)
    .map((n) => ({ id: n.id, size: tileCountForTroops(n.totalTroops) }))
    .sort((a, b) => b.size - a.size);

  for (const n of others) growBlob(tiles, n.id, n.size, rng);
  // プレイヤーの本拠地は他国配置が終わった後、必ず隣接するマスに置く
  placeAdjacentToExisting(tiles, PLAYER_NATION.id, tileCountForTroops(PLAYER_NATION.totalTroops), rng);
  // 空白地が残らないよう、余ったマスは隣接する国へ塗り広げて埋める(最初から全マスがどこかの国の領土になる)
  // 隠しボス国の領土だけは、これ以上広がらないよう塗り広げの対象から除外する
  fillRemainingGaps(tiles, rng, hiddenBoss?.id);

  const owners = tiles.map((nationId) => {
    if (nationId === PLAYER_NATION.id) return 'player';
    if (hiddenBoss && nationId === hiddenBoss.id) return 'sealed';
    return nationId;
  });
  const capitals = computeCapitals(tiles);
  const fortresses = computeFortresses(tiles, capitals);
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, owners, capitals, fortresses };
}

// 王都・砦の仕組みを追加する前に生成された古い保存データ(capitals/fortressesが無い)を
// その場で補完する。既存プレイヤーのセーブデータが壊れて読み込めなくなるのを防ぐための移行処理。
export function ensureMapExtras(map) {
  if (!map.capitals) map.capitals = computeCapitals(map.tiles);
  if (!map.fortresses) map.fortresses = computeFortresses(map.tiles, map.capitals);
  return map;
}

// 各国の領土のうち、最も中心に近いマスを首都に定める(首都を落とすと国ごと総取りできる)
function computeCapitals(tiles) {
  const byNation = {};
  for (let i = 0; i < tiles.length; i++) {
    const n = tiles[i];
    if (!n) continue;
    (byNation[n] = byNation[n] || []).push(i);
  }
  const capitals = {};
  for (const [nationId, indices] of Object.entries(byNation)) {
    let best = indices[0];
    let bestScore = Infinity;
    for (const i of indices) {
      const ix = i % MAP_WIDTH;
      const iy = Math.floor(i / MAP_WIDTH);
      let sumDist = 0;
      for (const j of indices) {
        const jx = j % MAP_WIDTH;
        const jy = Math.floor(j / MAP_WIDTH);
        sumDist += Math.abs(ix - jx) + Math.abs(iy - jy);
      }
      if (sumDist < bestScore) {
        bestScore = sumDist;
        best = i;
      }
    }
    capitals[nationId] = best;
  }
  return capitals;
}

// 指定したマスが、その国の首都かどうか
export function isCapitalTile(map, tileIndex) {
  const nationId = map.tiles[tileIndex];
  return !!nationId && map.capitals?.[nationId] === tileIndex;
}

// 領土が3マス以上ある国には、首都から最も離れたマスに前線の砦(出城)を1つ置く。
// 首都ほどの重みはないが、地図上の目印・見た目のアクセントとして機能する。
function computeFortresses(tiles, capitals) {
  const byNation = {};
  for (let i = 0; i < tiles.length; i++) {
    const n = tiles[i];
    if (!n) continue;
    (byNation[n] = byNation[n] || []).push(i);
  }
  const fortresses = {};
  for (const [nationId, indices] of Object.entries(byNation)) {
    if (indices.length < 3) continue;
    const capital = capitals[nationId];
    let best = null;
    let bestDist = -1;
    for (const i of indices) {
      if (i === capital) continue;
      const ix = i % MAP_WIDTH;
      const iy = Math.floor(i / MAP_WIDTH);
      const cx = capital % MAP_WIDTH;
      const cy = Math.floor(capital / MAP_WIDTH);
      const dist = Math.abs(ix - cx) + Math.abs(iy - cy);
      if (dist > bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best !== null) fortresses[nationId] = best;
  }
  return fortresses;
}

// 指定したマスが、その国の砦(出城)かどうか
export function isFortressTile(map, tileIndex) {
  const nationId = map.tiles[tileIndex];
  return !!nationId && map.fortresses?.[nationId] === tileIndex;
}

// ブロブ配置後に残った空白マスを、隣接する国の領土で塗り広げて埋め尽くす。
// excludeIdを渡すと、その国(隠しボスの予約領土)はこれ以上広がらないよう塗り広げの候補から除外する
function fillRemainingGaps(tiles, rng, excludeId) {
  let hasEmpty = tiles.some((t) => !t);
  let safety = 0;
  while (hasEmpty && safety < 100) {
    safety++;
    hasEmpty = false;
    const snapshot = [...tiles];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const i = idx(x, y);
        if (snapshot[i]) continue;
        const neighborOwners = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && snapshot[idx(nx, ny)]) {
            const nOwner = snapshot[idx(nx, ny)];
            if (!excludeId || nOwner !== excludeId) neighborOwners.push(nOwner);
          }
        }
        if (neighborOwners.length) {
          tiles[i] = neighborOwners[Math.floor(rng() * neighborOwners.length)];
        } else {
          hasEmpty = true;
        }
      }
    }
  }
  // 稀に「隠しボス国の予約領土にしか隣接していない」空白マスが残るケースのための最終フォールバック。
  // 除外条件なしで通常通り埋め、無主状態のマスが残ってcomputeCapitals等が壊れるのを防ぐ
  if (excludeId && tiles.some((t) => !t)) fillRemainingGaps(tiles, rng, null);
}

function neighborsOf(i) {
  const x = i % MAP_WIDTH;
  const y = Math.floor(i / MAP_WIDTH);
  const result = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT) result.push(idx(nx, ny));
  }
  return result;
}

// 現在プレイヤーが領有しているマスに隣接する「国境」の一覧(=次に攻められるマス)。
// (無主化(中立)したマスも、たどり着ければ無血で取り込める対象として含める)
export function getAttackableTiles(map, owners) {
  const attackable = new Set();
  const visited = new Set();
  const queue = [];
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === 'player') {
      queue.push(i);
      visited.add(i);
    }
  }
  while (queue.length) {
    const i = queue.shift();
    for (const n of neighborsOf(i)) {
      if (visited.has(n)) continue;
      const ownerNation = owners[n];
      if (ownerNation === 'sealed') {
        // 封印中の隠しボス領土は、攻撃対象にも通行経路にもならない
        visited.add(n);
        continue;
      }
      if (ownerNation === 'player') {
        // 自国の領土は素通りして、その先の探索を続ける
        visited.add(n);
        queue.push(n);
      } else if (ownerNation) {
        attackable.add(n);
        visited.add(n);
      } else if (ownerNation === null && map.tiles[n]) {
        attackable.add(n); // 大国同士の争いで無主化したマス(戦闘なしで制圧できる)
        visited.add(n);
      }
    }
  }
  return attackable;
}

// 隣接マスが「無主化(中立)」しているかどうか(戦闘なしでそのまま制圧できる)
export function isNeutralTile(map, owners, tileIndex) {
  return owners[tileIndex] === null && !!map.tiles[tileIndex];
}

// 各国が現在まだ保持しているマス数(=残り駐留軍の数)
export function remainingTileCount(map, owners, nationId) {
  let count = 0;
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === nationId) count++;
  }
  return count;
}

export function totalTileCount(map, nationId) {
  return map.tiles.filter((t) => t === nationId).length;
}

// 背景シミュレーション: プレイヤーが1戦する度に、隣接する国がプレイヤー領土を
// 奪い返しにくる可能性を判定する(簡易な確率計算のみで、実際の戦術戦闘は行わない)
export function simulateRivalIncursions(map, owners, nationLookup, boostFactor = 1) {
  const capturedTiles = [];
  const playerTiles = [];
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === 'player') playerTiles.push(i);
  }
  for (const tileIdx of playerTiles) {
    for (const n of neighborsOf(tileIdx)) {
      const attackerNation = owners[n];
      if (!attackerNation || attackerNation === 'player' || attackerNation === 'sealed') continue;
      const nation = nationLookup(attackerNation);
      if (!nation) continue;
      // 総兵力が大きい国ほど侵攻してきやすい(あくまで簡易な確率判定)。世界情勢の強化分も加味する
      const chance = Math.min(0.12, 0.02 + (nation.totalTroops * boostFactor) / 800000);
      if (Math.random() < chance) {
        owners[tileIdx] = attackerNation;
        capturedTiles.push({ tileIndex: tileIdx, byNation: attackerNation });
        break;
      }
    }
  }
  return capturedTiles;
}

// 難易度による大国同士の動き(ヘル: 大国同盟が弱小国を飲み込む / ソフト: 大国同士が争って弱体化する)
export function simulateGreatPowerDynamics(map, owners, worldEvent) {
  if (worldEvent !== 'ally_and_crush' && worldEvent !== 'infighting') return null;
  if (Math.random() > 0.35) return null; // 毎回起きるわけではない、あくまで時々の出来事

  const strength = {};
  for (const o of owners) {
    if (o && o !== 'player' && o !== 'sealed') strength[o] = (strength[o] || 0) + 1;
  }
  const ranked = Object.keys(strength).sort((a, b) => strength[b] - strength[a]);
  if (ranked.length < 2) return null;
  const [big1, big2] = ranked;

  if (worldEvent === 'ally_and_crush') {
    // 二大国が結託し、より弱い国から1マス奪って取り込む(大国がどんどん肥大化していく)
    const victim = ranked.slice(2)[Math.floor(Math.random() * Math.max(1, ranked.length - 2))];
    if (!victim) return null;
    const victimTiles = [];
    for (let i = 0; i < owners.length; i++) if (owners[i] === victim) victimTiles.push(i);
    if (!victimTiles.length) return null;
    const tile = victimTiles[Math.floor(Math.random() * victimTiles.length)];
    const conqueror = Math.random() < 0.5 ? big1 : big2;
    owners[tile] = conqueror;
    return { type: 'ally_and_crush', victim, conqueror, tileIndex: tile };
  }

  // infighting: 二大国が争い、一方が1マスを失う(そのマスは無主化し、誰でも無血で入り込める)
  const loser = Math.random() < 0.5 ? big1 : big2;
  const loserTiles = [];
  for (let i = 0; i < owners.length; i++) if (owners[i] === loser) loserTiles.push(i);
  if (!loserTiles.length) return null;
  const tile = loserTiles[Math.floor(Math.random() * loserTiles.length)];
  owners[tile] = null;
  return { type: 'infighting', loser, winner: loser === big1 ? big2 : big1, tileIndex: tile };
}
