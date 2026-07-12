// ゲームモード設定(盤面サイズ・部隊数だけがモードごとに違う)

export const MODES = {
  easy: {
    id: 'easy',
    name: 'お手軽モード',
    desc: '7x7・1陣営3部隊。数分で気軽に遊べる。',
    boardSize: 7,
    deployDepth: 1,
    squadCount: 3, // 大将1 + 一般2
    viceGeneralCount: 0,
  },
  official: {
    id: 'official',
    name: '公式ルールモード',
    desc: '11x11・1陣営7部隊。オンライン対戦の標準ルール。',
    boardSize: 11,
    deployDepth: 2,
    squadCount: 7, // 大将1 + 一般6
    viceGeneralCount: 0,
  },
  large: {
    id: 'large',
    name: '大規模バトルモード',
    desc: '15x15・1陣営25部隊+副将2。分隊・統合を駆使する本格戦。',
    boardSize: 15,
    deployDepth: 3,
    squadCount: 25, // 大将1 + 一般24
    viceGeneralCount: 2,
  },
};

export function getMode(id) {
  return MODES[id] || MODES.easy;
}
