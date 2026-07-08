// 武将ガチャ専用の拡張キャラクターロースター(☆1〜☆5)。
// ストーリーモードの出陣メンバー選択(常にノア・リオ・ガイ・セラの4人)とは別に、
// ガチャで集める「武将カード」だけがこの拡張ロースターを使う。
import { UNIT_TYPES } from './units.js';
import { PLAYER_NATION, STORY_NATIONS, PLAYER_CHARACTERS, findPlayerCharacter } from './story.js';

function dominantTypeOf(ratios) {
  return Object.values(UNIT_TYPES).reduce((best, type) =>
    (ratios[type] || 0) > (ratios[best] || 0) ? type : best
  , UNIT_TYPES.INFANTRY);
}

function findNationLoose(id) {
  return id === PLAYER_NATION.id ? PLAYER_NATION : STORY_NATIONS.find((n) => n.id === id);
}

// レアリティごとの、大将・副将として使った時の追加ランクボーナス(スキルの強さの差もここで表現する)
export const RARITY_RANK_BONUS = { 5: 3, 4: 2, 3: 1, 2: 0, 1: 0 };

// ---------- ☆5: 主要4キャラ(ノア・ジェネス・ギンジ・シノノメ)。他より強めのスキルを持つ ----------
const FIVE_STAR_NATION_IDS = ['haitetsu', 'soukai', 'fuin'];
function charFromPlayer(charId, rarity, titleOverride) {
  const c = findPlayerCharacter(charId);
  return {
    id: c.id, name: c.name, title: titleOverride || c.title, type: c.type, color: PLAYER_NATION.color,
    skillName: c.skillName, skillDesc: c.skillDesc, skillEffect: c.skillEffect, source: 'player', rarity, nationId: PLAYER_NATION.id,
  };
}
function charFromNation(n, rarity) {
  return {
    id: n.id, name: n.monarch, title: `${n.name}の君主`, type: dominantTypeOf(n.composition), color: n.color,
    skillName: n.skillName, skillDesc: n.skillDesc, skillEffect: n.skillEffect, source: 'nation', rarity, nationId: n.id,
  };
}

const MONARCH_CARDS = STORY_NATIONS.map((n) => charFromNation(n, FIVE_STAR_NATION_IDS.includes(n.id) ? 5 : 4));
const NOA_CARD = charFromPlayer('noa', 5);

// ---------- ☆3: 各国のNo.2(副将格)。黎明はセラが担う ----------
const SERA_CARD = charFromPlayer('sera', 3, '黎明の副将');

const NATION_NO2_DATA = {
  haitetsu: { name: 'ボルツ', skillName: '不意打ち', skillDesc: '反撃なしのまま同ターン中にもう一度射撃できる', skillEffect: 'rapid', type: UNIT_TYPES.CAVALRY },
  haga: { name: 'バルク', skillName: '大盾突撃', skillDesc: 'このターンだけ移動力+2', skillEffect: 'charge', type: UNIT_TYPES.CAVALRY },
  shinkyu: { name: 'スイレン', skillName: '連射の心得', skillDesc: '反撃なしのまま同ターン中にもう一度射撃できる', skillEffect: 'rapid', type: UNIT_TYPES.ARCHER },
  kyogan: { name: 'ガンテツ', skillName: '重盾構え', skillDesc: 'この部隊は次に防御する戦闘だけ地形防御+2', skillEffect: 'shield', type: UNIT_TYPES.INFANTRY },
  inrou: { name: 'キバ', skillName: '牙の一撃', skillDesc: 'このターンだけ移動力+2', skillEffect: 'charge', type: UNIT_TYPES.CAVALRY },
  ryusen: { name: 'ショウ', skillName: '貫きの構え', skillDesc: 'この部隊は次に防御する戦闘だけ地形防御+2', skillEffect: 'shield', type: UNIT_TYPES.CAVALRY },
  fuin: { name: 'ツクヨ', skillName: '静謐の号令', skillDesc: '隣接する味方全員に密集陣形ボーナス+2を追加(次の相手ターンまで)', skillEffect: 'inspire', type: UNIT_TYPES.INFANTRY },
  rekka: { name: 'カグラ', skillName: '火風の疾走', skillDesc: 'このターンだけ移動力+2', skillEffect: 'charge', type: UNIT_TYPES.CAVALRY },
  soukai: { name: 'ナギ', skillName: '凪の一射', skillDesc: '反撃なしのまま同ターン中にもう一度射撃できる', skillEffect: 'rapid', type: UNIT_TYPES.ARCHER },
};

const NATION_NO2_CARDS = Object.entries(NATION_NO2_DATA).map(([nationId, d]) => {
  const n = findNationLoose(nationId);
  return {
    id: `${nationId}_no2`, name: d.name, title: `${n.name}の副将`, type: d.type, color: n.color,
    skillName: d.skillName, skillDesc: d.skillDesc, skillEffect: d.skillEffect, source: 'no2', rarity: 3, nationId,
  };
});

// ---------- ☆1/☆2: 各国の一般武将(20〜30人)。☆2はプレミアム相当のスキル、☆1は基本スキル ----------
const RANK_FILE_NAMES = {
  reimei: ['レイ', 'ミナ', 'ハル'],
  haitetsu: ['ドグマ', 'ラスト', 'ネジ'],
  haga: ['ゴウキ', 'バイソン', 'ダイキ'],
  shinkyu: ['ツバキ', 'カエデ'],
  kyogan: ['イワオ', 'ガンジ'],
  inrou: ['ロウガ', 'シズク'],
  ryusen: ['リュウノスケ', 'セイ'],
  fuin: ['クロウ', 'アヤメ'],
  rekka: ['カエン', 'アカネ'],
  soukai: ['ウミ', 'ソラ', 'ナミ'],
};

const BASE_SKILLS = {
  [UNIT_TYPES.INFANTRY]: { skillName: '盾構え', skillDesc: 'この部隊は次に防御する戦闘だけ地形防御+2', skillEffect: 'shield' },
  [UNIT_TYPES.ARCHER]: { skillName: '連射', skillDesc: '反撃なしのまま同ターン中にもう一度射撃できる', skillEffect: 'rapid' },
  [UNIT_TYPES.CAVALRY]: { skillName: '強行突破', skillDesc: 'このターンだけ移動力+2', skillEffect: 'charge' },
};
const PREMIUM_SKILLS = {
  [UNIT_TYPES.INFANTRY]: { skillName: '鉄壁の護り', skillDesc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する', skillEffect: 'ironwall' },
  [UNIT_TYPES.ARCHER]: { skillName: '一点狙撃', skillDesc: '次の射撃だけ、相手の地形防御と密集陣形ボーナスを無視する', skillEffect: 'snipe' },
  [UNIT_TYPES.CAVALRY]: { skillName: '電光石火', skillDesc: 'このターンだけ移動力+3。奇襲を使用済みでも発動できる', skillEffect: 'lightning' },
};
const RANK_FILE_TYPES = [UNIT_TYPES.INFANTRY, UNIT_TYPES.ARCHER, UNIT_TYPES.CAVALRY];

function buildRankAndFileCards() {
  const list = [];
  for (const [nationId, names] of Object.entries(RANK_FILE_NAMES)) {
    const nation = findNationLoose(nationId);
    names.forEach((name, i) => {
      const rarity = i === 0 ? 2 : 1;
      const type = RANK_FILE_TYPES[i % RANK_FILE_TYPES.length];
      const skill = (rarity === 2 ? PREMIUM_SKILLS : BASE_SKILLS)[type];
      list.push({
        id: `${nationId}_${i + 1}`, name, title: `${nation.name}の武将`, type, color: nation.color,
        skillName: skill.skillName, skillDesc: skill.skillDesc, skillEffect: skill.skillEffect,
        source: 'rankfile', rarity, nationId,
      });
    });
  }
  return list;
}

// リオ・ガイは黎明の一般武将(☆2)として引き続き使えるようにする
const RIO_CARD = charFromPlayer('rio', 2);
const GAI_CARD = charFromPlayer('gai', 2);

export const CHARACTER_CARDS = [
  NOA_CARD,
  ...MONARCH_CARDS,
  SERA_CARD,
  ...NATION_NO2_CARDS,
  RIO_CARD,
  GAI_CARD,
  ...buildRankAndFileCards(),
];

export function findCharacterCard(id) {
  return CHARACTER_CARDS.find((c) => c.id === id) || null;
}

export const RARITY_LABEL = { 5: '☆☆☆☆☆', 4: '☆☆☆☆', 3: '☆☆☆', 2: '☆☆', 1: '☆' };

// ガチャで同じ武将カードが何枚集まると仲間になるか(以降は10枚ごとに能力が少しずつ上がり続ける)
export const CHARACTER_GACHA_UNLOCK_COUNT = 10;
export const CHARACTER_GACHA_STEP = 10;

// 集めた枚数に応じた追加ランクボーナス(10枚ごとに+1、上限なし)
export function characterCollectionBonus(count) {
  return Math.floor((count || 0) / CHARACTER_GACHA_STEP);
}
