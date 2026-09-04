import { useEffect, useRef, useCallback } from "react";
import { sfx } from "@/lib/sound";

export type BugKind = "normal" | "dorado" | "bomba" | "jefe" | "mariposa" | "araña" | "abeja" | "escarabajo";
export type Theme = "prado" | "playa" | "noche" | "artico" | "volcan";

type Bug = {
  x: number;
  y: number;
  r: number;
  v: number;
  a: number;
  d: number;
  alive: boolean;
  hue: number;
  pop: number;
  value: number;
  kind: BugKind;
  lives: number;
  // Extra motion state
  orbitAngle: number; // for abeja circular orbit
  pauseTimer: number; // for araña pause-sprint
};

type PowerUpType = "time" | "freeze" | "double";

type PowerUp = {
  x: number;
  y: number;
  r: number;
  type: PowerUpType;
  alive: boolean;
  bob: number;
};

type Floater = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  dy: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

export const GAME_SECONDS = 45;

export type GameState = "idle" | "playing" | "over";

export type GameStats = {
  caught: number;
  missed: number;
  maxCombo: number;
  bosses: number;
  gold: number;
};

const EMPTY_STATS: GameStats = { caught: 0, missed: 0, maxCombo: 0, bosses: 0, gold: 0 };

export function AntGame({
  state,
  paused,
  onStateChange,
  onScore,
  score,
  timeLeft,
  onTick,
  onComboChange,
  onStats,
  onCaught,
  level,
  theme,
}: {
  state: GameState;
  paused: boolean;
  onStateChange: (s: GameState) => void;
  onScore: (n: number) => void;
  score: number;
  timeLeft: number;
  onTick: (t: number) => void;
  onComboChange: (combo: number) => void;
  onStats: (stats: GameStats) => void;
  onCaught: (stats: GameStats) => void;
  level: number;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bugsRef = useRef<Bug[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const floatersRef = useRef<Floater[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const stateRef = useRef(state);
  const pausedRef = useRef(paused);
  const scoreRef = useRef(score);
  const levelRef = useRef(level);
  const themeRef = useRef(theme);
  const comboRef = useRef(0);
  const lastCatchRef = useRef(0);
  const statsRef = useRef<GameStats>({ ...EMPTY_STATS });
  const lastBossLevelRef = useRef(0);
  const timeRef = useRef(0);
  const activeEffectsRef = useRef({ freeze: 0, double: 0 });
  const spawnTimerRef = useRef(0);
  const powerUpTimerRef = useRef(0);

  stateRef.current = state;
  pausedRef.current = paused;
  scoreRef.current = score;
  levelRef.current = level;
  themeRef.current = theme;

  const valueForBug = (kind: BugKind, r: number, v: number) => {
    if (kind === "jefe") return 25;
    if (kind === "escarabajo") return 8;
    if (kind === "araña") return 6;
    if (kind === "mariposa") return 4;
    if (kind === "abeja") return 3;
    if (kind === "dorado") return 10;
    if (kind === "bomba") return -5;
    if (r < 12) return 3;
    if (v > 1.8) return 2;
    return 1;
  };

  const spawn = useCallback((w: number, h: number, count = 1) => {
    const lvl = levelRef.current;
    for (let i = 0; i < count; i++) {
      const edge = Math.random() < 0.5;
      const r = 9 + Math.random() * 10;
      const v = (1 + Math.random() * 1.6) * (1 + (lvl - 1) * 0.15);
      let kind: BugKind = "normal";
      const roll = Math.random();

      // Probability table (cumulative) — rarer bugs appear in higher levels
      if (lvl >= 2 && roll < 0.08) kind = "bomba";
      else if (roll < 0.15) kind = "dorado";
      else if (lvl >= 2 && roll < 0.22) kind = "mariposa";
      else if (lvl >= 3 && roll < 0.29) kind = "abeja";
      else if (lvl >= 4 && roll < 0.34) kind = "araña";
      else if (lvl >= 5 && roll < 0.36) kind = "escarabajo";

      const bugRadius = kind === "mariposa" ? r * 0.85 : kind === "araña" ? r * 1.1 : r;
      const bugSpeed =
        kind === "mariposa"
          ? v * 1.6
          : kind === "araña"
            ? v * 0.55
            : kind === "abeja"
              ? v * 1.1
              : kind === "escarabajo"
                ? v * 0.4
                : v;

      bugsRef.current.push({
        x: edge ? w * Math.random() : Math.random() < 0.5 ? -50 : w + 50,
        y: edge ? (Math.random() < 0.5 ? -50 : h + 50) : h * Math.random(),
        r: bugRadius,
        v: bugSpeed,
        a: Math.random() * Math.PI * 2,
        d: 0,
        alive: true,
        hue:
          kind === "dorado"
            ? 50
            : kind === "mariposa"
              ? 280 + Math.random() * 60
              : kind === "araña"
                ? 0
                : kind === "abeja"
                  ? 42
                  : kind === "escarabajo"
                    ? 145
                    : [0, 25, 200, 280, 140][Math.floor(Math.random() * 5)] ?? 0,
        pop: 0,
        value: valueForBug(kind, r, v),
        kind,
        lives: 1,
        orbitAngle: Math.random() * Math.PI * 2,
        pauseTimer: 0,
      });
    }
  }, []);

  const spawnBoss = useCallback((w: number, h: number) => {
    bugsRef.current.push({
      x: w / 2,
      y: -80,
      r: 34,
      v: 0.7,
      a: Math.PI,
      d: 0,
      alive: true,
      hue: 350,
      pop: 0,
      value: 25,
      kind: "jefe",
      lives: 3,
      orbitAngle: 0,
      pauseTimer: 0,
    });
  }, []);

  const spawnPowerUp = useCallback((w: number, h: number) => {
    const type: PowerUpType = ["time", "freeze", "double"][Math.floor(Math.random() * 3)] as PowerUpType;
    powerUpsRef.current.push({
      x: 60 + Math.random() * (w - 120),
      y: 80 + Math.random() * (h - 160),
      r: 22,
      type,
      alive: true,
      bob: 0,
    });
  }, []);

  const addFloater = (x: number, y: number, text: string, color: string) => {
    floatersRef.current.push({ x, y, text, life: 1, color, dy: -1.2 });
  };

  const burst = (x: number, y: number, hue: number, count = 12) => {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1,
        life: 1,
        color: `hsl(${hue + (Math.random() * 30 - 15)} 80% ${55 + Math.random() * 20}%)`,
        size: 2 + Math.random() * 4,
      });
    }
  };

  // reset on new game
  useEffect(() => {
    if (state !== "playing") return;
    const cv = canvasRef.current;
    if (!cv) return;
    bugsRef.current = [];
    powerUpsRef.current = [];
    floatersRef.current = [];
    particlesRef.current = [];
    comboRef.current = 0;
    lastCatchRef.current = 0;
    spawnTimerRef.current = 0;
    powerUpTimerRef.current = 0;
    lastBossLevelRef.current = 0;
    activeEffectsRef.current = { freeze: 0, double: 0 };
    statsRef.current = { ...EMPTY_STATS };
    onComboChange(0);
    spawn(cv.clientWidth, cv.clientHeight, 5);
  }, [state, spawn, onComboChange]);

  // timer
  useEffect(() => {
    if (state !== "playing" || paused) return;
    const id = window.setInterval(() => onTick(-1), 1000);
    return () => window.clearInterval(id);
  }, [state, paused, onTick]);

  useEffect(() => {
    if (state === "playing" && timeLeft <= 0) {
      onStats({ ...statsRef.current });
      onStateChange("over");
    }
  }, [timeLeft, state, onStateChange, onStats]);

  // ─── BACKGROUNDS ────────────────────────────────────────────────────────────

  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number, t: Theme, tick: number) => {
    if (t === "prado") {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(200 80% 82%)");
      sky.addColorStop(0.55, "hsl(150 45% 78%)");
      sky.addColorStop(1, "hsl(120 50% 62%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // sol
      ctx.fillStyle = "hsl(50 100% 75%)";
      ctx.beginPath();
      ctx.arc(w - 90, 90, 46, 0, Math.PI * 2);
      ctx.fill();
      // flores
      for (let i = 0; i < 10; i++) {
        const fx = (i * 173) % (w || 1);
        const fy = h * 0.7 + ((i * 97) % Math.max(1, h * 0.28));
        ctx.fillStyle = `hsl(${(i * 47) % 360} 80% 75%)`;
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t === "playa") {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(195 90% 78%)");
      sky.addColorStop(0.55, "hsl(190 85% 70%)");
      sky.addColorStop(0.62, "hsl(45 80% 78%)");
      sky.addColorStop(1, "hsl(42 75% 68%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "hsl(48 100% 70%)";
      ctx.beginPath();
      ctx.arc(w - 100, 90, 50, 0, Math.PI * 2);
      ctx.fill();
      // olas
      ctx.strokeStyle = "hsl(200 80% 88% / 0.8)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const yy = h * 0.56 + i * 10 + Math.sin(tick / 30 + i) * 3;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 20) {
          ctx.lineTo(x, yy + Math.sin(x / 40 + tick / 25 + i) * 4);
        }
        ctx.stroke();
      }
    } else if (t === "noche") {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(250 45% 18%)");
      sky.addColorStop(1, "hsl(230 40% 32%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // luna
      ctx.fillStyle = "hsl(55 60% 88%)";
      ctx.beginPath();
      ctx.arc(w - 100, 90, 42, 0, Math.PI * 2);
      ctx.fill();
      // estrellas
      for (let i = 0; i < 40; i++) {
        const sx = (i * 197) % Math.max(1, w);
        const sy = (i * 113) % Math.max(1, h * 0.6);
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin(tick / 40 + i)) * 0.6;
        ctx.fillStyle = "hsl(60 80% 90%)";
        ctx.fillRect(sx, sy, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
      // luciérnagas
      for (let i = 0; i < 8; i++) {
        const fx = w / 2 + Math.sin(tick / 90 + i * 1.7) * (w * 0.35) * Math.cos(i);
        const fy = h / 2 + Math.cos(tick / 110 + i * 2.3) * (h * 0.3);
        ctx.fillStyle = "hsl(75 100% 70% / 0.9)";
        ctx.shadowColor = "hsl(75 100% 70%)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (t === "artico") {
      // ─── Ártico ───────────────────────────────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(210 60% 20%)");
      sky.addColorStop(0.4, "hsl(200 55% 40%)");
      sky.addColorStop(1, "hsl(195 70% 82%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // aurora boreal — ondas suaves de color
      const auroraColors = ["hsl(140 80% 55% / 0.25)", "hsl(180 70% 60% / 0.2)", "hsl(280 60% 65% / 0.18)"];
      for (let ai = 0; ai < 3; ai++) {
        ctx.beginPath();
        ctx.fillStyle = auroraColors[ai]!;
        const yBase = h * 0.15 + ai * h * 0.07;
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 4) {
          const y = yBase + Math.sin(x / 80 + tick / 60 + ai * 2) * 28 + Math.sin(x / 40 + tick / 40) * 14;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      }

      // suelo nevado
      const ground = ctx.createLinearGradient(0, h * 0.75, 0, h);
      ground.addColorStop(0, "hsl(210 30% 90%)");
      ground.addColorStop(1, "hsl(210 20% 98%)");
      ctx.fillStyle = ground;
      ctx.fillRect(0, h * 0.75, w, h * 0.25);

      // copos de nieve cayendo
      for (let i = 0; i < 35; i++) {
        const sx = ((i * 193 + (tick * (0.3 + (i % 5) * 0.12))) % (w + 20)) - 10;
        const sy = ((i * 137 + tick * (0.5 + (i % 4) * 0.15)) % (h + 20)) - 10;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(tick / 30 + i);
        ctx.fillStyle = "hsl(210 40% 98%)";
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // luna ártica
      ctx.shadowColor = "hsl(210 60% 90%)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "hsl(210 30% 95%)";
      ctx.beginPath();
      ctx.arc(w - 90, 80, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // ─── Volcán ───────────────────────────────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(10 60% 12%)");
      sky.addColorStop(0.5, "hsl(20 70% 22%)");
      sky.addColorStop(1, "hsl(25 80% 32%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // nubes de humo oscuras
      for (let i = 0; i < 5; i++) {
        const cx = w * 0.3 + (i * 97) % (w * 0.5);
        const cy = h * 0.1 + (i * 43) % (h * 0.2);
        const cr = 35 + (i % 3) * 20;
        const smokeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        smokeGrad.addColorStop(0, "hsl(15 20% 18% / 0.7)");
        smokeGrad.addColorStop(1, "hsl(15 15% 10% / 0)");
        ctx.fillStyle = smokeGrad;
        ctx.beginPath();
        ctx.arc(cx + Math.sin(tick / 80 + i) * 6, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      // silueta del volcán
      ctx.fillStyle = "hsl(15 30% 10%)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w * 0.25, h * 0.55);
      ctx.lineTo(w * 0.38, h * 0.38);
      ctx.lineTo(w * 0.5, h * 0.55);
      ctx.lineTo(w * 0.62, h * 0.38);
      ctx.lineTo(w * 0.75, h * 0.55);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // lava rio en el fondo
      const lavaGrad = ctx.createLinearGradient(0, h * 0.8, 0, h);
      lavaGrad.addColorStop(0, "hsl(25 100% 50%)");
      lavaGrad.addColorStop(0.5, "hsl(10 100% 40%)");
      lavaGrad.addColorStop(1, "hsl(5 80% 25%)");
      ctx.fillStyle = lavaGrad;
      ctx.fillRect(0, h * 0.82, w, h * 0.18);

      // burbujas de lava
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 173 + tick * 0.4) % w);
        const by = h * 0.83 + ((i * 37) % (h * 0.12));
        const phase = Math.sin(tick / 20 + i * 1.3);
        if (phase > 0.7) {
          ctx.fillStyle = `hsl(35 100% ${60 + phase * 20}% / 0.9)`;
          ctx.beginPath();
          ctx.arc(bx, by, 3 + (i % 4) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // partículas de brasa flotando hacia arriba
      for (let i = 0; i < 20; i++) {
        const ex = w * 0.38 + Math.sin(tick / 30 + i * 2.1) * 22;
        const ey = ((h * 0.38 - (tick * (0.8 + (i % 5) * 0.3) + i * 31)) % (h * 0.5)) + h * -0.1;
        const eyWrapped = ((ey % h) + h) % h;
        ctx.globalAlpha = Math.max(0, 0.8 - eyWrapped / h);
        ctx.fillStyle = `hsl(${25 + (i % 20)} 100% 60%)`;
        ctx.beginPath();
        ctx.arc(ex, eyWrapped, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
        // second volcano
        const ex2 = w * 0.62 + Math.sin(tick / 35 + i * 1.7) * 18;
        const ey2 = ((h * 0.38 - (tick * (0.7 + (i % 4) * 0.25) + i * 47)) % (h * 0.5)) + h * -0.1;
        const ey2Wrapped = ((ey2 % h) + h) % h;
        ctx.globalAlpha = Math.max(0, 0.7 - ey2Wrapped / h);
        ctx.beginPath();
        ctx.arc(ex2, ey2Wrapped, 1.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  // ─── BUG RENDERERS ──────────────────────────────────────────────────────────

  const drawButterfly = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    ctx.shadowColor = `hsl(${p.hue} 80% 70% / 0.7)`;
    ctx.shadowBlur = 10;

    const wingFlap = Math.sin(p.d * 0.25) * 0.3;
    // upper wings
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = `hsl(${p.hue} 70% 65%)`;
      ctx.beginPath();
      ctx.ellipse(p.r * 0.9, -p.r * 0.2, p.r * 0.9, p.r * 0.55, -0.4 + wingFlap * side, 0, Math.PI * 2);
      ctx.fill();
      // lower wings
      ctx.fillStyle = `hsl(${p.hue + 20} 65% 60%)`;
      ctx.beginPath();
      ctx.ellipse(p.r * 0.75, p.r * 0.35, p.r * 0.65, p.r * 0.38, 0.5 + wingFlap * side, 0, Math.PI * 2);
      ctx.fill();
      // wing pattern dots
      ctx.fillStyle = `hsl(${p.hue - 30} 40% 30% / 0.5)`;
      ctx.beginPath();
      ctx.arc(p.r * 0.85, -p.r * 0.1, p.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // body
    ctx.fillStyle = `hsl(${p.hue - 60} 50% 25%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.18, p.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // antennae
    ctx.strokeStyle = `hsl(${p.hue - 60} 40% 30%)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, -p.r * 0.5);
    ctx.quadraticCurveTo(-p.r * 0.5, -p.r * 1.1, -p.r * 0.55, -p.r * 1.25);
    ctx.moveTo(3, -p.r * 0.5);
    ctx.quadraticCurveTo(p.r * 0.5, -p.r * 1.1, p.r * 0.55, -p.r * 1.25);
    ctx.stroke();
    ctx.fillStyle = `hsl(${p.hue} 70% 60%)`;
    ctx.beginPath();
    ctx.arc(-p.r * 0.55, -p.r * 1.25, 2.5, 0, Math.PI * 2);
    ctx.arc(p.r * 0.55, -p.r * 1.25, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  const drawSpider = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // legs (4 pairs)
    ctx.strokeStyle = "hsl(0 5% 20%)";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    const wob = Math.sin(p.d * 0.3) * p.r * 0.25;
    for (let i = 0; i < 4; i++) {
      const yOff = ((i - 1.5) / 1.5) * p.r * 0.5;
      const lenMul = i === 0 || i === 3 ? 1.3 : 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.5, yOff);
        ctx.quadraticCurveTo(side * p.r * 1.1, yOff + wob * (i % 2 === 0 ? 1 : -1), side * p.r * 1.6 * lenMul, yOff + p.r * 0.3 * side);
        ctx.stroke();
      }
    }
    // abdomen (big dark blob behind)
    ctx.fillStyle = "hsl(0 10% 12%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.65, p.r * 0.7, p.r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // cephalothorax
    ctx.fillStyle = "hsl(0 8% 18%)";
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.1, p.r * 0.55, p.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // abdomen pattern
    ctx.fillStyle = "hsl(0 70% 45%)";
    ctx.beginPath();
    // hourglass shape on abdomen
    ctx.moveTo(0, p.r * 0.2);
    ctx.lineTo(p.r * 0.25, p.r * 0.55);
    ctx.lineTo(0, p.r * 0.75);
    ctx.lineTo(-p.r * 0.25, p.r * 0.55);
    ctx.closePath();
    ctx.fill();
    // eyes (8 tiny ones in 2 rows)
    ctx.fillStyle = "hsl(120 80% 55%)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-p.r * 0.3 + i * p.r * 0.2, -p.r * 0.18, p.r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-p.r * 0.22 + i * p.r * 0.15, -p.r * 0.05, p.r * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawBee = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // wings (semi-transparent, rapid flutter)
    const flutter = Math.sin(p.d * 0.5) * 0.2;
    ctx.fillStyle = "hsl(200 60% 85% / 0.55)";
    ctx.strokeStyle = "hsl(200 40% 60% / 0.4)";
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.ellipse(p.r * 0.9, -p.r * 0.55, p.r * 0.75, p.r * 0.35, -0.3 + flutter * side, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p.r * 0.7, p.r * 0.1, p.r * 0.5, p.r * 0.25, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // abdomen stripes
    const stripeCount = 4;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? "hsl(42 100% 52%)" : "hsl(0 0% 10%)";
      ctx.beginPath();
      ctx.ellipse(0, -p.r * 0.1 + i * p.r * 0.45, p.r * (0.55 - Math.abs(i - 1.5) * 0.08), p.r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // head
    ctx.fillStyle = "hsl(42 80% 30%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.7, p.r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "hsl(0 0% 90%)";
    ctx.beginPath();
    ctx.arc(-p.r * 0.16, -p.r * 0.78, p.r * 0.12, 0, Math.PI * 2);
    ctx.arc(p.r * 0.16, -p.r * 0.78, p.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // stinger
    ctx.fillStyle = "hsl(42 60% 25%)";
    ctx.beginPath();
    ctx.moveTo(0, p.r * 0.75);
    ctx.lineTo(-p.r * 0.08, p.r * 0.9);
    ctx.lineTo(p.r * 0.08, p.r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawBeetle = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    ctx.shadowColor = "hsl(145 80% 40% / 0.8)";
    ctx.shadowBlur = 14;

    // legs (slow walker — exaggerated legs)
    ctx.strokeStyle = "hsl(145 40% 15%)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const wob = Math.sin(p.d * 0.15) * p.r * 0.2;
    for (let i = 0; i < 3; i++) {
      const yOff = ((i - 1) * p.r * 0.5);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.5, yOff);
        ctx.lineTo(side * p.r * 1.4, yOff + wob * (i % 2 === 0 ? 1 : -1));
        ctx.stroke();
      }
    }
    // elytra (hard wing covers) — iridescent green
    const elytraGrad = ctx.createRadialGradient(-p.r * 0.15, -p.r * 0.1, 0, 0, 0, p.r * 1.1);
    elytraGrad.addColorStop(0, "hsl(145 80% 55%)");
    elytraGrad.addColorStop(0.5, "hsl(160 75% 40%)");
    elytraGrad.addColorStop(1, "hsl(180 60% 25%)");
    ctx.fillStyle = elytraGrad;
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.15, p.r * 0.7, p.r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    // elytra center line
    ctx.strokeStyle = "hsl(145 50% 25%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 0.75);
    ctx.lineTo(0, p.r * 1.05);
    ctx.stroke();
    // pronotum
    ctx.fillStyle = "hsl(145 70% 38%)";
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.7, p.r * 0.52, p.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = "hsl(145 60% 22%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 1.1, p.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // eyes — orange contrast
    ctx.fillStyle = "hsl(30 100% 60%)";
    ctx.beginPath();
    ctx.arc(-p.r * 0.14, -p.r * 1.14, p.r * 0.1, 0, Math.PI * 2);
    ctx.arc(p.r * 0.14, -p.r * 1.14, p.r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // mandibles
    ctx.strokeStyle = "hsl(145 40% 18%)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-p.r * 0.1, -p.r * 1.35);
    ctx.lineTo(-p.r * 0.25, -p.r * 1.55);
    ctx.moveTo(p.r * 0.1, -p.r * 1.35);
    ctx.lineTo(p.r * 0.25, -p.r * 1.55);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  const drawBug = (ctx: CanvasRenderingContext2D, p: Bug) => {
    if (p.kind === "mariposa") { drawButterfly(ctx, p); return; }
    if (p.kind === "araña") { drawSpider(ctx, p); return; }
    if (p.kind === "abeja") { drawBee(ctx, p); return; }
    if (p.kind === "escarabajo") { drawBeetle(ctx, p); return; }

    if (p.kind === "bomba") {
      const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;
      ctx.font = `${p.r * 2.2}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💣", 0, 0);
      ctx.restore();
      return;
    }

    const s = (p.pop > 0 ? 1 + p.pop * 0.6 : 1) * (p.kind === "jefe" ? 1 : 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    if (activeEffectsRef.current.freeze > 0) {
      ctx.shadowColor = "oklch(0.8 0.2 220 / 0.8)";
      ctx.shadowBlur = 12;
    } else if (p.kind === "dorado") {
      ctx.shadowColor = "hsl(50 100% 60% / 0.9)";
      ctx.shadowBlur = 18;
    } else if (p.kind === "jefe") {
      ctx.shadowColor = "hsl(350 90% 55% / 0.7)";
      ctx.shadowBlur = 20;
    }

    // legs
    ctx.strokeStyle = `hsl(${p.hue} 55% 25%)`;
    ctx.lineWidth = Math.max(1.6, p.r / 7);
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i++) {
      const wob = Math.sin(p.d / 4 + i) * p.r * 0.3;
      ctx.beginPath();
      ctx.moveTo(-p.r * 0.4, i * p.r * 0.4);
      ctx.lineTo(-p.r * 1.1, i * p.r * 0.5 + wob);
      ctx.moveTo(p.r * 0.4, i * p.r * 0.4);
      ctx.lineTo(p.r * 1.1, i * p.r * 0.5 - wob);
      ctx.stroke();
    }
    // body
    ctx.fillStyle = `hsl(${p.hue} 75% 52%)`;
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.35, p.r * 0.75, p.r, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = `hsl(${p.hue} 70% 42%)`;
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.35, p.r * 0.5, p.r * 0.45, 0, 0, 7);
    ctx.fill();
    // head
    ctx.fillStyle = `hsl(${p.hue} 60% 30%)`;
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.95, p.r * 0.42, p.r * 0.4, 0, 0, 7);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-p.r * 0.18, -p.r * 1.05, p.r * 0.16, 0, 7);
    ctx.arc(p.r * 0.18, -p.r * 1.05, p.r * 0.16, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-p.r * 0.18, -p.r * 1.08, p.r * 0.07, 0, 7);
    ctx.arc(p.r * 0.18, -p.r * 1.08, p.r * 0.07, 0, 7);
    ctx.fill();
    // spots
    ctx.fillStyle = `hsl(${p.hue} 60% 22%)`;
    ctx.beginPath();
    ctx.arc(-p.r * 0.3, p.r * 0.3, p.r * 0.18, 0, 7);
    ctx.arc(p.r * 0.3, p.r * 0.55, p.r * 0.16, 0, 7);
    ctx.fill();

    // corona del jefe
    if (p.kind === "jefe") {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "hsl(50 100% 60%)";
      ctx.beginPath();
      const cy = -p.r * 1.55;
      ctx.moveTo(-p.r * 0.4, cy);
      ctx.lineTo(-p.r * 0.4, cy - p.r * 0.35);
      ctx.lineTo(-p.r * 0.2, cy - p.r * 0.1);
      ctx.lineTo(0, cy - p.r * 0.4);
      ctx.lineTo(p.r * 0.2, cy - p.r * 0.1);
      ctx.lineTo(p.r * 0.4, cy - p.r * 0.35);
      ctx.lineTo(p.r * 0.4, cy);
      ctx.closePath();
      ctx.fill();
      // vidas
      ctx.rotate(-p.a);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${p.r * 0.5}px sans-serif`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "hsl(350 80% 40%)";
      ctx.lineWidth = 3;
      const hearts = "❤".repeat(p.lives);
      ctx.strokeText(hearts, 0, -p.r * 2.1);
      ctx.fillStyle = "hsl(350 90% 55%)";
      ctx.fillText(hearts, 0, -p.r * 2.1);
    }

    ctx.restore();
  };

  const drawPowerUp = (ctx: CanvasRenderingContext2D, p: PowerUp) => {
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(p.bob) * 4);
    ctx.globalAlpha = 0.95;

    const colors: Record<PowerUpType, string> = {
      time: "oklch(0.75 0.18 85)",
      freeze: "oklch(0.75 0.18 220)",
      double: "oklch(0.75 0.18 300)",
    };

    ctx.shadowColor = colors[p.type];
    ctx.shadowBlur = 16;
    ctx.fillStyle = "oklch(0.99 0.01 95)";
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = colors[p.type];
    ctx.font = `bold ${p.r * 1.1}px "Nunito", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icons: Record<PowerUpType, string> = { time: "⏰", freeze: "❄️", double: "⚡" };
    ctx.fillText(icons[p.type], 0, 1);
    ctx.restore();
  };

  const drawFloater = (ctx: CanvasRenderingContext2D, f: Floater) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.font = `bold 22px "Baloo 2", "Nunito", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "oklch(1 0 0 / 0.7)";
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  };

  // ─── MAIN LOOP ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      timeRef.current += 1;
      drawBackground(ctx, w, h, themeRef.current, timeRef.current);

      const playing = stateRef.current === "playing" && !pausedRef.current;

      if (playing) {
        if (activeEffectsRef.current.freeze > 0) activeEffectsRef.current.freeze -= 1 / 60;
        if (activeEffectsRef.current.double > 0) activeEffectsRef.current.double -= 1 / 60;
      }

      if (playing) {
        spawnTimerRef.current += 1 / 60;
        const elapsed = GAME_SECONDS - timeLeft;
        const lvl = levelRef.current;
        const difficulty = 1 + elapsed * 0.03;
        const targetInterval = Math.max(0.6, 2.2 - elapsed * 0.03 - lvl * 0.1);
        if (spawnTimerRef.current > targetInterval) {
          spawnTimerRef.current = 0;
          spawn(w, h, Math.min(3, 1 + Math.floor(difficulty / 2)));
        }

        // jefe en niveles 3, 6, 9...
        if (lvl >= 3 && lvl % 3 === 0 && lastBossLevelRef.current !== lvl) {
          const bossAlive = bugsRef.current.some((b) => b.kind === "jefe" && b.alive);
          if (!bossAlive) {
            lastBossLevelRef.current = lvl;
            spawnBoss(w, h);
          }
        }

        powerUpTimerRef.current += 1 / 60;
        if (powerUpTimerRef.current > 8 + Math.random() * 7) {
          powerUpTimerRef.current = 0;
          if (powerUpsRef.current.length < 2) spawnPowerUp(w, h);
        }
      }

      for (const p of bugsRef.current) {
        if (p.alive && playing) {
          const speedMul = activeEffectsRef.current.freeze > 0 ? 0.35 : 1;

          if (p.kind === "mariposa") {
            // zigzag sinusoidal — changes direction rapidly
            p.a += (Math.random() * 2 - 1) * 0.18;
            p.orbitAngle += 0.12;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
            // extra lateral sine wave
            p.x += Math.sin(p.orbitAngle) * 1.8 * speedMul;
          } else if (p.kind === "araña") {
            // pause-sprint behavior
            p.pauseTimer -= 1 / 60;
            if (p.pauseTimer <= 0) {
              // decide: pause or sprint
              if (Math.random() < 0.3) {
                p.pauseTimer = 0.6 + Math.random() * 0.8; // pause duration
                // set velocity to near-zero during pause
                p.v = 0.05;
              } else {
                p.pauseTimer = 0.2 + Math.random() * 0.4; // sprint duration
                p.v = (2.2 + Math.random() * 1.5) * (1 + (levelRef.current - 1) * 0.15);
                p.a = Math.random() * Math.PI * 2;
              }
            }
            p.a += (Math.random() * 2 - 1) * 0.06;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
          } else if (p.kind === "abeja") {
            // circular orbit pattern
            p.orbitAngle += 0.055 * speedMul;
            p.a += (Math.random() * 2 - 1) * 0.06;
            p.x += p.v * Math.sin(p.a) * speedMul + Math.cos(p.orbitAngle) * 1.2 * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul + Math.sin(p.orbitAngle) * 1.2 * speedMul;
          } else {
            // default movement (normal, dorado, jefe, escarabajo — slow wander)
            const turnSpeed = p.kind === "jefe" ? 0.04 : p.kind === "escarabajo" ? 0.04 : 0.08;
            p.a += (Math.random() * 2 - 1) * turnSpeed;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
          }

          p.d += p.v * speedMul;

          // boundary bounce
          if (p.x < -20) p.a = Math.PI / 2 + (Math.random() - 0.5);
          if (p.x > w + 20) p.a = -Math.PI / 2 + (Math.random() - 0.5);
          if (p.y < -20) p.a = Math.PI + (Math.random() - 0.5);
          if (p.y > h + 20) p.a = Math.random() - 0.5;
        }
        if (!p.alive) p.pop += 0.06;
        if (p.pop < 1) drawBug(ctx, p);
      }
      bugsRef.current = bugsRef.current.filter((p) => p.pop < 1);

      for (const p of powerUpsRef.current) {
        if (playing) p.bob += 0.08;
        if (p.alive) drawPowerUp(ctx, p);
      }

      // partículas
      for (const pt of particlesRef.current) {
        if (playing || pt.life < 1) {
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.08;
          pt.life -= 0.025;
        }
        if (pt.life > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.life);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      particlesRef.current = particlesRef.current.filter((pt) => pt.life > 0);

      for (const f of floatersRef.current) {
        if (playing || f.life < 1) {
          f.y += f.dy;
          f.life -= 0.02;
        }
        if (f.life > 0) drawFloater(ctx, f);
      }
      floatersRef.current = floatersRef.current.filter((f) => f.life > 0);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawn, spawnBoss, spawnPowerUp, timeLeft]);

  // ─── INPUT ───────────────────────────────────────────────────────────────────

  const tap = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv || stateRef.current !== "playing" || pausedRef.current) return;
    const rect = cv.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // power-ups first
    let powerHit = false;
    for (const p of powerUpsRef.current) {
      if (p.alive && Math.hypot(p.x - x, p.y - y) < p.r * 1.6) {
        p.alive = false;
        powerHit = true;
        sfx.powerup();
        if (p.type === "time") {
          onTick(10);
          addFloater(x, y, "+10s", "oklch(0.7 0.18 85)");
        } else if (p.type === "freeze") {
          activeEffectsRef.current.freeze = 5;
          addFloater(x, y, "¡Congelado!", "oklch(0.7 0.18 220)");
        } else if (p.type === "double") {
          activeEffectsRef.current.double = 5;
          addFloater(x, y, "¡x2 puntos!", "oklch(0.7 0.18 300)");
        }
      }
    }
    if (powerHit) {
      powerUpsRef.current = powerUpsRef.current.filter((p) => p.alive);
      return;
    }

    let hits = 0;
    let gained = 0;
    let bombHit = false;
    let bossKilled = false;

    for (const p of bugsRef.current) {
      if (!p.alive) continue;
      const dist = Math.hypot(p.x - x, p.y - y);
      // mariposa is harder to hit (smaller hitbox relative to visual size)
      const hitMul = p.kind === "mariposa" ? 1.6 : p.kind === "araña" ? 2.8 : p.kind === "escarabajo" ? 2.0 : 2.2;
      if (dist < p.r * hitMul) {
        if (p.kind === "bomba") {
          p.alive = false;
          bombHit = true;
          burst(p.x, p.y, 15, 16);
          addFloater(p.x, p.y - 20, "-5 💥", "oklch(0.6 0.22 25)");
          continue;
        }
        if (p.kind === "jefe" && p.lives > 1) {
          p.lives -= 1;
          sfx.bossHit();
          burst(x, y, p.hue, 8);
          addFloater(p.x, p.y - p.r * 2, `¡${p.lives} más!`, "oklch(0.75 0.18 350)");
          continue;
        }
        p.alive = false;
        hits++;
        gained += p.value;
        statsRef.current.caught += 1;
        if (p.kind === "dorado") statsRef.current.gold += 1;
        if (p.kind === "jefe") {
          statsRef.current.bosses += 1;
          bossKilled = true;
        }
        burst(p.x, p.y, p.hue, p.kind === "jefe" ? 26 : p.kind === "escarabajo" ? 20 : 12);
      } else if (dist < 160 && p.kind !== "bomba") {
        // scatter nearby bugs
        if (p.kind !== "araña") {
          p.v = 2 + Math.random() * 2;
          p.a = Math.atan2(p.x - x, y - p.y) + (Math.random() - 0.5);
        }
      }
    }

    bugsRef.current = bugsRef.current.filter((p) => p.alive || p.pop < 1);

    if (bombHit) {
      sfx.bomb();
      onScore(-5);
      if (comboRef.current > 1) addFloater(x, y + 20, "¡Combo perdido!", "oklch(0.55 0.15 25)");
      comboRef.current = 0;
      lastCatchRef.current = 0;
      onComboChange(0);
      if (!hits) return;
    }

    if (hits) {
      const now = performance.now();
      if (now - lastCatchRef.current < 1300) {
        comboRef.current += 1;
      } else {
        comboRef.current = 1;
      }
      lastCatchRef.current = now;
      onComboChange(comboRef.current);
      sfx.catch(comboRef.current);

      statsRef.current.maxCombo = Math.max(statsRef.current.maxCombo, comboRef.current);
      onCaught({ ...statsRef.current });

      const double = activeEffectsRef.current.double > 0 ? 2 : 1;
      const comboMul = 1 + (comboRef.current - 1) * 0.5;
      gained = Math.round(gained * comboMul * double);
      onScore(gained);
      addFloater(x, y - 20, `+${gained}`, "oklch(0.65 0.2 30)");
      if (bossKilled) addFloater(x, y - 80, "¡JEFE ATRAPADO! 👑", "oklch(0.7 0.2 350)");
      if (comboRef.current > 1) {
        addFloater(x, y - 50, `Combo x${comboRef.current}`, "oklch(0.7 0.18 300)");
      }
      spawn(cv.clientWidth, cv.clientHeight, hits + 1);
    } else if (!bombHit) {
      if (comboRef.current > 1) {
        addFloater(x, y, "¡Combo perdido!", "oklch(0.55 0.15 25)");
      }
      sfx.miss();
      comboRef.current = 0;
      lastCatchRef.current = 0;
      onComboChange(0);
      statsRef.current.missed += 1;
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        tap(e.clientX, e.clientY);
      }}
    />
  );
}
