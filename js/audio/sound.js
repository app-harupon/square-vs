// Web Audio APIによる完全プロシージャル生成のBGM・効果音エンジン。
// 外部音声ファイルは一切使わず、その場でオシレーターから波形を合成する
// (このプロジェクト全体の「アセットは全部コードで生成する」方針に合わせている)。

let ctx = null;
let masterGain = null;
let sfxGain = null;
let bgmGain = null;
let muted = false;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.22;
    bgmGain.connect(masterGain);
  }
  return ctx;
}

// ブラウザの自動再生制限を回避するため、最初のユーザー操作でAudioContextを起動する。
// その時点でBGM再生の予約(playBgmが先に呼ばれていた場合)があれば、ここで実際に鳴らし始める。
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const c = getCtx();
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (bgmCurrentTrack) {
    const track = bgmCurrentTrack;
    scheduleBgmLoop(track);
  }
}

export function setMuted(value) {
  muted = value;
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 1, getCtx().currentTime, 0.05);
}
export function isMuted() {
  return muted;
}

// ---------- 効果音(短いオシレーター音の組み合わせ) ----------
function tone(freq, start, duration, { type = 'sine', gain = 0.3, sweepTo = null, attack = 0.005 } = {}) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(start, duration, { gain = 0.25, filterFreq = 1200 } = {}) {
  const c = getCtx();
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const SFX = {
  tap: (c, t) => tone(660, t, 0.06, { type: 'triangle', gain: 0.18 }),
  deploy: (c, t) => {
    tone(300, t, 0.09, { type: 'sine', gain: 0.22, sweepTo: 460 });
  },
  move: (c, t) => {
    tone(420, t, 0.12, { type: 'sine', gain: 0.16, sweepTo: 260 });
  },
  melee: (c, t) => {
    noiseBurst(t, 0.12, { gain: 0.3, filterFreq: 900 });
    tone(140, t, 0.16, { type: 'square', gain: 0.22, sweepTo: 60 });
  },
  ranged: (c, t) => {
    tone(900, t, 0.14, { type: 'sawtooth', gain: 0.14, sweepTo: 1600 });
  },
  cardUse: (c, t) => {
    [880, 1108, 1318].forEach((f, i) => tone(f, t + i * 0.05, 0.16, { type: 'triangle', gain: 0.16 }));
  },
  capital: (c, t) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, 0.28, { type: 'triangle', gain: 0.2 }));
  },
  victory: (c, t) => {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.1, 0.35, { type: 'triangle', gain: 0.22 }));
  },
  defeat: (c, t) => {
    [440, 392, 349, 293].forEach((f, i) => tone(f, t + i * 0.16, 0.4, { type: 'sine', gain: 0.2 }));
  },
  error: (c, t) => {
    tone(180, t, 0.12, { type: 'square', gain: 0.15 });
  },
  select: (c, t) => tone(740, t, 0.05, { type: 'sine', gain: 0.14 }),
};

export function playSfx(name) {
  if (muted || !unlocked) return;
  const c = getCtx();
  const fn = SFX[name];
  if (!fn) return;
  try {
    fn(c, c.currentTime);
  } catch {
    // AudioContextが何らかの理由で使えない環境では何もしない
  }
}

// ---------- BGM(短い和音進行をループさせる簡易シーケンサー) ----------
// 各トラックは [周波数(null=休符), 拍数] の配列。1拍 = beatSec 秒。
const NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392.0, A4: 440.0, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G3: 196.0, A3: 220.0, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6 };

const BGM_TRACKS = {
  menu: {
    beatSec: 0.42,
    lead: [
      [NOTE.C4, 1], [NOTE.E4, 1], [NOTE.G4, 1], [NOTE.E4, 1],
      [NOTE.A4, 1], [NOTE.G4, 1], [NOTE.E4, 1], [NOTE.D4, 1],
      [NOTE.F4, 1], [NOTE.A4, 1], [NOTE.G4, 1], [NOTE.E4, 1],
      [NOTE.D4, 1], [NOTE.C4, 1], [NOTE.D4, 1], [NOTE.G3, 1],
    ],
    bass: [
      [NOTE.C3, 4], [NOTE.A3, 4], [NOTE.F3, 4], [NOTE.G3, 4],
    ],
  },
  battle: {
    beatSec: 0.28,
    lead: [
      [NOTE.D4, 1], [NOTE.D4, 1], [NOTE.F4, 1], [NOTE.D4, 1],
      [NOTE.A4, 1], [NOTE.F4, 1], [NOTE.D4, 1], [null, 1],
      [NOTE.E4, 1], [NOTE.E4, 1], [NOTE.G4, 1], [NOTE.E4, 1],
      [NOTE.C5, 1], [NOTE.G4, 1], [NOTE.E4, 1], [null, 1],
    ],
    bass: [
      [NOTE.D3, 2], [NOTE.D3, 2], [NOTE.A3, 2], [NOTE.A3, 2],
      [NOTE.E3, 2], [NOTE.E3, 2], [NOTE.A3, 2], [NOTE.A3, 2],
    ],
  },
  story: {
    beatSec: 0.38,
    lead: [
      [NOTE.G4, 1.5], [NOTE.E4, 0.5], [NOTE.D4, 1], [NOTE.C4, 1],
      [NOTE.D4, 1], [NOTE.E4, 1], [NOTE.G4, 1.5], [NOTE.A4, 0.5],
      [NOTE.G4, 1], [NOTE.E4, 1], [NOTE.D4, 1.5], [null, 0.5],
    ],
    bass: [
      [NOTE.C3, 4], [NOTE.G3, 4], [NOTE.A3, 4], [NOTE.F3, 4],
    ],
  },
};

let bgmTimer = null;
let bgmCurrentTrack = null;

function scheduleBgmLoop(trackName) {
  const track = BGM_TRACKS[trackName];
  if (!track || muted === undefined) return;
  const c = getCtx();
  const startAt = c.currentTime + 0.05;
  const playLine = (notes, gainScale, type) => {
    let t = startAt;
    for (const [freq, beats] of notes) {
      const dur = beats * track.beatSec;
      if (freq) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gainScale, t + 0.02);
        g.gain.setValueAtTime(gainScale, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.98);
        osc.connect(g);
        g.connect(bgmGain);
        osc.start(t);
        osc.stop(t + dur);
      }
      t += dur;
    }
    return t;
  };
  const leadEnd = playLine(track.lead, 0.5, 'triangle');
  playLine(track.bass, 0.35, 'sine');
  const totalBeats = track.lead.reduce((sum, [, b]) => sum + b, 0);
  const loopDurationMs = totalBeats * track.beatSec * 1000;
  bgmTimer = setTimeout(() => {
    if (bgmCurrentTrack === trackName) scheduleBgmLoop(trackName);
  }, loopDurationMs);
}

export function playBgm(trackName) {
  if (!BGM_TRACKS[trackName]) return;
  if (bgmCurrentTrack === trackName) return;
  stopBgm();
  bgmCurrentTrack = trackName;
  if (!unlocked) return; // アンロック前は曲名だけ覚えておき、unlockAudio後に自動再開する
  scheduleBgmLoop(trackName);
}

export function stopBgm() {
  clearTimeout(bgmTimer);
  bgmTimer = null;
  bgmCurrentTrack = null;
}
