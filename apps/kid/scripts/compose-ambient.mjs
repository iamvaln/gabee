// Variant "mix" — melody of variant 1 (music-box phrases) over the rhythm
// engine of variant 3 (108 BPM, sixteenth arps, offbeat bass, tick+shaker),
// on variant 1's 12-bar progression. Seamless wrap loop.
import { writeFileSync } from 'node:fs';

const SR = 22050;
const BPM = 108;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;               // 2.222 s
const BARS = 12;
const N = Math.round(SR * BAR * BARS); // ~26.7 s
const buf = new Float64Array(N);

const SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
const f = (name, oct) => 440 * Math.pow(2, (SEMI[name] + (oct - 4) * 12) / 12);

function note(tSec, freq, { amp = 0.1, dur = 1.0, attack = 0.003, h2 = 0.25, h3 = 0.08, decay = 3.4 } = {}) {
  const start = Math.round(tSec * SR);
  const len = Math.round(dur * SR);
  const atk = Math.round(attack * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (i < atk ? i / atk : 1) * Math.exp(-decay * (t / dur));
    const ph = 2 * Math.PI * freq * t;
    const s = Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph);
    buf[(start + i) % N] += s * env * amp;
  }
}
function tick(tSec, amp = 0.028) {
  note(tSec, 1600, { amp, dur: 0.07, attack: 0.001, h2: 0.4, h3: 0, decay: 3.8 });
}
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5;
function shaker(tSec, amp = 0.014) {
  const start = Math.round(tSec * SR);
  const len = Math.round(0.06 * SR);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const hp = rnd() - last * 0.6; last = hp;
    buf[(start + i) % N] += hp * Math.exp(-9 * (i / len)) * amp * 2;
  }
}


/** Soft round "kick": sine pitch-drop 120->55 Hz, short, gentle. */
function kick(tSec, amp = 0.10) {
  const start = Math.round(tSec * SR);
  const len = Math.round(0.16 * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const freq = 200 * Math.pow(90 / 200, t); // exponential drop (tom-like, audible on small speakers)
    phase += (2 * Math.PI * freq) / SR;
    buf[(start + i) % N] += Math.sin(phase) * Math.exp(-4.5 * t) * amp;
  }
}

// Variant 1's progression, with variant 3's 4-note chord voicings.
const PROG = ['A', 'D', 'A', 'E', 'A', 'D', 'F#m', 'E', 'A', 'D', 'E', 'A'];
const CHORDS = {
  A:    { root: ['A', 2],  tones: [['A', 3], ['C#', 4], ['E', 4], ['A', 4]] },
  D:    { root: ['D', 3],  tones: [['D', 4], ['F#', 4], ['A', 4], ['D', 5]] },
  E:    { root: ['E', 2],  tones: [['E', 3], ['G#', 3], ['B', 3], ['E', 4]] },
  'F#m':{ root: ['F#', 2], tones: [['F#', 3], ['A', 3], ['C#', 4], ['F#', 4]] },
};

// Variant 1's melody, verbatim: three 4-bar phrases at bars 0 / 4 / 8.
const PHRASE_A = [
  [0, 'E', 5, 2], [2, 'C#', 5, 1], [3, 'A', 4, 1],
  [4, 'B', 4, 2], [6, 'D', 5, 2],
  [8, 'C#', 5, 1.5], [9.5, 'E', 5, 1.5], [11, 'A', 5, 1],
  [12, 'G#', 4, 2], [14, 'B', 4, 2],
];
const PHRASE_B = [
  [0, 'A', 5, 2], [2, 'E', 5, 1], [3, 'C#', 5, 1],
  [4, 'F#', 5, 2], [6, 'D', 5, 2],
  [8, 'C#', 5, 1], [9, 'A', 4, 1], [10, 'B', 4, 2],
  [12, 'G#', 4, 1.5], [13.5, 'B', 4, 1.5], [15, 'E', 5, 1],
];
const PHRASE_C = [
  [0, 'E', 5, 1], [1, 'C#', 5, 1], [2, 'A', 4, 2],
  [4, 'F#', 4, 2], [6, 'B', 4, 2],
  [8, 'G#', 4, 1], [9, 'B', 4, 1], [10, 'C#', 5, 2],
  [12, 'A', 4, 4], // resolves home; tail wraps into bar 1
];
for (const [phrase, barStart] of [[PHRASE_A, 0], [PHRASE_B, 4], [PHRASE_C, 8]]) {
  for (const [beat, n, oct, durB] of phrase) {
    note(barStart * BAR + beat * BEAT, f(n, oct), { amp: 0.085, dur: Math.max(1.0, durB * BEAT * 1.4), h2: 0.35, h3: 0.12, decay: 3.2 });
  }
}

// Variant 3's rhythm engine ------------------------------------------------
// Sixteenth arpeggios (up-down), light.
PROG.forEach((name, bar) => {
  const { tones } = CHORDS[name];
  const order = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
  for (let s = 0; s < 16; s++) {
    const [n, oct] = tones[order[s]];
    note(bar * BAR + s * (BEAT / 4), f(n, oct), { amp: 0.019, dur: 0.22, h2: 0.15, h3: 0, decay: 3.8 });
  }
});
// Bass: root on 1, offbeat pluck on the "and" of 2, fifth on 3.
PROG.forEach((name, bar) => {
  const [rn, ro] = CHORDS[name].root;
  const t0 = bar * BAR;
  note(t0, f(rn, ro), { amp: 0.065, dur: 0.5, h2: 0.12, h3: 0, decay: 3.8 });
  note(t0 + 1.5 * BEAT, f(rn, ro), { amp: 0.045, dur: 0.35, h2: 0.12, h3: 0, decay: 3.8 });
  note(t0 + 2 * BEAT, f(rn, ro) * 1.5, { amp: 0.04, dur: 0.4, h2: 0.1, h3: 0, decay: 3.8 });
});
// Percussion: soft kick on 1 & 3, tick ("snare") on 2 & 4,
// shaker in steady eighths (accented offbeats), all kid-gentle.
for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  kick(t0);
  kick(t0 + 2 * BEAT, 0.085);
  tick(t0 + BEAT, 0.05);
  tick(t0 + 3 * BEAT, 0.05);
  for (let e = 0; e < 8; e++) shaker(t0 + e * (BEAT / 2), e % 2 ? 0.026 : 0.014);
  shaker(t0 + 3.5 * BEAT, 0.04); // tambourine-ish accent on the "and of 4"
}

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const scale = 0.55 / peak;
const pcm = new Int16Array(N);
for (let i = 0; i < N; i++) pcm[i] = Math.round(buf[i] * scale * 32767);
const data = Buffer.from(pcm.buffer);
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
const out = process.argv[2] ?? 'ambient-mix-percus.wav';
writeFileSync(out, Buffer.concat([h, data]));
console.log(`wrote ${out}: ${44 + data.length} bytes, ${(N / SR).toFixed(1)}s`);
