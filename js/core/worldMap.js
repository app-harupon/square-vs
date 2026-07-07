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

// プレイヤーの本拠地は、必ずどこかの国と隣接するマスから配置する
// (孤立したマスに置かれると、隣接国が1つもなく詰んでしまうため)
function placeAdjacentToExisting(tiles, nationId, targetSize) {
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
    growBlob(tiles, nationId, targetSize); // 万一隣接候補がなければ通常のブロブ生成にフォールバック
    return;
  }
  const [sx, sy] = candidates[Math.floor(Math.random() * candidates.length)];
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

// 世界地図を新規生成する(キャンペーン開始時に1回だけ呼び、プロフィールに保存して固定する)
export function generateWorldMap() {
  const tiles = new Array(MAP_WIDTH * MAP_HEIGHT).fill(null);
  const others = STORY_NATIONS.map((n) => ({ id: n.id, size: tileCountForTroops(n.totalTroops) }))
    .sort((a, b) => b.size - a.size);

  for (const n of others) growBlob(tiles, n.id, n.size);
  // プレイヤーの本拠地は他国配置が終わった後、必ず隣接するマスに置く
  placeAdjacentToExisting(tiles, PLAYER_NATION.id, tileCountForTroops(PLAYER_NATION.totalTroops));
  // 空白地が残らないよう、余ったマスは隣接する国へ塗り広げて埋める(最初から全マスがどこかの国の領土になる)
  fillRemainingGaps(tiles);

  const owners = tiles.map((nationId) => (nationId === PLAYER_NATION.id ? 'player' : nationId));
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, owners };
}

// ブロブ配置後に残った空白マスを、隣接する国の領土で塗り広げて埋め尽くす
function fillRemainingGaps(tiles) {
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
            neighborOwners.push(snapshot[idx(nx, ny)]);
          }
        }
        if (neighborOwners.length) {
          tiles[i] = neighborOwners[Math.floor(Math.random() * neighborOwners.length)];
        } else {
          hasEmpty = true;
        }
      }
    }
  }
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
// (無主化(中立)したマスも、隣接していれば無血で取り込める対象として含める)
export function getAttackableTiles(map, owners, alliances) {
  const attackable = new Set();
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] !== 'player') continue;
    for (const n of neighborsOf(i)) {
      const ownerNation = owners[n];
      if (ownerNation && ownerNation !== 'player' && !alliances.includes(ownerNation)) {
        attackable.add(n);
      } else if (ownerNation === null && map.tiles[n]) {
        attackable.add(n); // 大国同士の争いで無主化したマス(戦闘なしで制圧できる)
      }
    }
  }
  return attackable;
}

// 隣接マスが「無主化(中立)」しているかどうか(戦闘なしでそのまま制圧できる)
export function isNeutralTile(map, owners, tileIndex) {
  return owners[tileIndex] === null && !!map.tiles[tileIndex];
}

// 同盟を結べる(まだ未制圧・未同盟で、プレイヤー領土に隣接する)国の一覧
export function getAllianceCandidates(map, owners, alliances) {
  const candidates = new Set();
  for (const tileIdx of getAttackableTiles(map, owners, alliances)) {
    if (owners[tileIdx]) candidates.add(owners[tileIdx]);
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

// 難易度による大国同士の動き(ヘル: 大国同盟が弱小国を飲み込む / ソフト: 大国同士が争って弱体化する)
export function simulateGreatPowerDynamics(map, owners, worldEvent) {
  if (worldEvent !== 'ally_and_crush' && worldEvent !== 'infighting') return null;
  if (Math.random() > 0.35) return null; // 毎回起きるわけではない、あくまで時々の出来事

  const strength = {};
  for (const o of owners) {
    if (o && o !== 'player') strength[o] = (strength[o] || 0) + 1;
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
