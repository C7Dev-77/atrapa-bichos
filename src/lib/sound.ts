// Motor de audio sintetizado con Web Audio API — sin archivos externos.

let ctx: AudioContext | null = null;
let musicTimer: number | null = null;
let nextNoteTime = 0;
let noteIndex = 0;

let muted = false;
if (typeof window !== "undefined") {
  muted = localStorage.getItem("ab-muted") === "1";
}

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("ab-muted", m ? "1" : "0");
  } catch {
    /* noop */
  }
  if (m) stopMusic();
}

export function ensureAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  delay = 0,
  slide = 0,
) {
  if (muted) return;
  try {
    const ac = ensureAudio();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch {
    /* audio no disponible */
  }
}

export const sfx = {
  catch: (combo = 1) => {
    const base = 440 + Math.min(combo, 10) * 40;
    tone(base, 0.12, "triangle", 0.2, 0, 200);
    tone(base * 1.5, 0.1, "sine", 0.1, 0.03);
  },
  miss: () => tone(160, 0.2, "sawtooth", 0.07, 0, -60),
  powerup: () => {
    tone(523, 0.1, "square", 0.1);
    tone(659, 0.1, "square", 0.1, 0.08);
    tone(784, 0.18, "square", 0.1, 0.16);
  },
  bomb: () => {
    tone(120, 0.4, "sawtooth", 0.22, 0, -80);
    tone(60, 0.4, "square", 0.18, 0.02);
  },
  bossHit: () => tone(300, 0.15, "square", 0.18, 0, 100),
  levelUp: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, "triangle", 0.14, i * 0.09));
  },
  gameOver: () => {
    [784, 659, 523, 392].forEach((f, i) => tone(f, 0.25, "triangle", 0.14, i * 0.15));
  },
  record: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, "square", 0.1, i * 0.1));
  },
  achievement: () => {
    tone(880, 0.12, "sine", 0.14);
    tone(1175, 0.25, "sine", 0.14, 0.1);
  },
  dodge: () => {
    tone(700, 0.08, "sawtooth", 0.1, 0, 500);
  },
  cash: () => {
    [987, 1318].forEach((f, i) => tone(f, 0.12, "sine", 0.12, i * 0.08));
  },
};

// Música de fondo: bucle alegre con melodía y bajo.
const MELODY = [523, 587, 659, 784, 659, 587, 523, 392, 440, 523, 587, 659, 587, 523, 440, 392];

function scheduleNote(ac: AudioContext, freq: number, t: number, dur: number, vol: number, type: OscillatorType) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function startMusic() {
  if (muted || musicTimer !== null) return;
  try {
    const ac = ensureAudio();
    nextNoteTime = ac.currentTime + 0.1;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      while (nextNoteTime < ac.currentTime + 0.4) {
        const freq = MELODY[noteIndex % MELODY.length]!;
        scheduleNote(ac, freq, nextNoteTime, 0.22, 0.05, "triangle");
        if (noteIndex % 4 === 0) {
          scheduleNote(ac, freq / 4, nextNoteTime, 0.35, 0.05, "sine");
        }
        noteIndex++;
        nextNoteTime += 0.24;
      }
    }, 120);
  } catch {
    /* audio no disponible */
  }
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
