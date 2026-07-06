// ストーリーモードの「世界地図」生成・領有・隣接判定ロジック。
// 各国の領土マス数は総兵力÷2000(繰り上げ)。1マスあたりおよそ2000人の駐留軍として扱う。
import { STORY_NATIONS, PLAYER_NATION } from './story.js';

export const MAP_WIDTH = 9;
export const MAP_HEIGHT = 7;
const TROOPS_PER_TILE = 2000;

export function tileCountForTroops(totalTroops) {
  return Math.max(1, Math.ceil(totalTroops / TROOPS_PER_TILE));
}

function idx(x, y) {
  return y * MAP_WIDTH + x;
}

// 国ごとの陣取り塊(ブロブ)を盤面にランダム生成する。地形生成のforestブロブ生成と同じ考え方。
function growBlob(tiles, nationId, targetSize) {
  const empty = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!tiles[idx(x, y)]) empty.push([x, y]);
    }
  }
  if (!empty.length) return;
  const [sx, sy] = empty[Math.floor(Math.random() * empty.length)];
  const frontier = [[sx, sy]];
  const visited = new Set();
  let placed = 0;
  while (frontier.length && placed < targetSize) {
    const i = Math.floor(Math.random() * frontier.length);
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

// 世界地図を新規生成する(キャンペーン開始時に1回だけ呼び、プロフィールに保存して固定する)
export function generateWorldMap() {
  const tiles = new Array(MAP_WIDTH * MAP_HEIGHT).fill(null);
  const all = [
    { id: PLAYER_NATION.id, size: tileCountForTroops(PLAYER_NATION.totalTroops) },
    ...STORY_NATIONS.map((n) => ({ id: n.id, size: tileCountForTroops(n.totalTroops) })),
  ].sort((a, b) => b.size - a.size);

  for (const n of all) growBlob(tiles, n.id, n.size);

  const owners = tiles.map((nationId) => (nationId === PLAYER_NATION.id ? 'player' : nationId));
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, owners };
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

// 現在プレイヤーが領有しているマスに隣接する、まだ他国(同盟国以外)が支配しているマスの一覧
export function getAttackableTiles(map, owners, alliances) {
  const attackable = new Set();
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] !== 'player') continue;
    for (const n of neighborsOf(i)) {
      const ownerNation = owners[n];
      if (ownerNation && ownerNation !== 'player' && !alliances.includes(ownerNation)) {
        attackable.add(n);
      }
    }
  }
  return attackable;
}

// 同盟を結べる(まだ未制圧・未同盟で、プレイヤー領土に隣接する)国の一覧
export function getAllianceCandidates(map, owners, alliances) {
  const candidates = new Set();
  for (const tileIdx of getAttackableTiles(map, owners, alliances)) {
    candidates.add(owners[tileIdx]);
  }
  return candidates;
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

// 背景シミュレーション: プレイヤーが1戦する度に、隣接する非同盟国がプレイヤー領土を
// 奪い返しにくる可能性を判定する(簡易な確率計算のみで、実際の戦術戦闘は行わない)
export function simulateRivalIncursions(map, owners, alliances, nationLookup) {
  const capturedTiles = [];
  const playerTiles = [];
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === 'player') playerTiles.push(i);
  }
  for (const tileIdx of playerTiles) {
    for (const n of neighborsOf(tileIdx)) {
      const attackerNation = owners[n];
      if (!attackerNation || attackerNation === 'player' || alliances.includes(attackerNation)) continue;
      const nation = nationLookup(attackerNation);
      if (!nation) continue;
      // 総兵力が大きい国ほど侵攻してきやすい(あくまで簡易な確率判定)
      const chance = Math.min(0.12, 0.02 + nation.totalTroops / 400000);
      if (Math.random() < chance) {
        owners[tileIdx] = attackerNation;
        capturedTiles.push({ tileIndex: tileIdx, byNation: attackerNation });
        break;
      }
    }
  }
  return capturedTiles;
}
