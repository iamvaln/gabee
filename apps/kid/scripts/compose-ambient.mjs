// Compose a seamless music-box ambient loop for the Gabee kid app.
// A major, 90 BPM, 12 bars (32 s), 22050 Hz mono 16-bit WAV (~1.4 MB).
// Seamlessness: every note tail is written modulo the loop length, so the
// last bar's decays continue into bar 1 — no click, no fade trick needed.
import { writeFileSync } from 'node:fs';

const SR = 22050;
const BPM = 90;
const BEAT = 60 / BPM;            // 0.6667 s
const BAR = 4 * BEAT;             // 2.6667 s
const BARS = 12;
const N = Math.round(SR * BAR * BARS); // 32 s exactly
const buf = new Float64Array(N);

// note name -> frequency (A4 = 440)
const SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
const f = (name, oct) => 440 * Math.pow(2, (SEMI[name] + (oct - 4) * 12) / 12);

/** Add one note: sine + soft harmonics, exponential decay, wrapped at the loop boundary. */
function note(tSec, freq, { amp = 0.1, dur = 1.0, attack = 0.004, h2 = 0.25, h3 = 0.08 } = {}) {
  const start = Math.round(tSec * SR);
  const len = Math.round(dur * SR);
  const atk = Math.round(attack * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (i < atk ? i / atk : 1) * Math.exp(-3.2 * (t / dur));
    const ph = 2 * Math.PI * freq * t;
    const s = Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph);
    buf[(start + i) % N] += s * env * amp; // wrap: seamless loop
  }
}

// Chord progression, one chord per bar (I–IV–I–V | I–IV–vi–V | I–IV–V–I)
const PROG = ['A', 'D', 'A', 'E', 'A', 'D', 'F#m', 'E', 'A', 'D', 'E', 'A'];
const CHORDS = {
  A:    { root: ['A', 2],  tones: [['A', 3], ['C#', 4], ['E', 4]] },
  D:    { root: ['D', 3],  tones: [['D', 4], ['F#', 4], ['A', 4]] },
  E:    { root: ['E', 2],  tones: [['E', 3], ['G#', 3], ['B', 3]] },
  'F#m':{ root: ['F#', 2], tones: [['F#', 3], ['A', 3], ['C#', 4]] },
};

// Melody: music-box bells, two gentle 4-bar phrases + a closing phrase.
// [barOffsetInBeats, note, octave, durBeats]
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
    note(barStart * BAR + beat * BEAT, f(n, oct), { amp: 0.085, dur: Math.max(1.2, durB * BEAT * 1.4), h2: 0.35, h3: 0.12 });
  }
}

// Accompaniment: soft eighth-note arpeggio over each bar's chord tones.
PROG.forEach((name, bar) => {
  const { tones } = CHORDS[name];
  for (let e = 0; e < 8; e++) {
    const [n, oct] = tones[[0, 1, 2, 1, 0, 1, 2, 1][e]];
    note(bar * BAR + e * (BEAT / 2), f(n, oct), { amp: 0.032, dur: 0.5, h2: 0.15, h3: 0 });
  }
});

// Bass: one warm root per bar, slow attack, decays within the bar (wraps anyway).
PROG.forEach((name, bar) => {
  const [n, oct] = CHORDS[name].root;
  note(bar * BAR, f(n, oct), { amp: 0.06, dur: BAR * 0.9, attack: 0.06, h2: 0.1, h3: 0 });
});

// Normalize to a soft ceiling (headroom for the app's 0.22 gain), then write WAV.
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
const out = process.argv[2] ?? 'ambient-hub.wav';
writeFileSync(out, Buffer.concat([h, data]));
console.log(`wrote ${out}: ${44 + data.length} bytes, ${(N / SR).toFixed(1)}s, peak scaled from ${peak.toFixed(2)}`);
