import { useEffect, useRef, useCallback } from "react";
import { sfx } from "@/lib/sound";

export type BugKind =
  | "oruga"
  | "escarabajo"
  | "hormiga"
  | "mariquita"
  | "araña"
  | "abeja"
  | "mariposa"
  | "mosca"
  | "avispa"
  | "mosquito"
  | "dorado"
  | "bomba"
  | "jefe";

export type Theme =
  | "prado"
  | "jardin"
  | "desierto"
  | "playa"
  | "bosque"
  | "pantano"
  | "noche"
  | "artico"
  | "volcan"
  | "cyber";

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
  orbitAngle: number; // for abeja/mariposa/fly
  pauseTimer: number; // for araña pause-sprint & fly zigzag
  segmentPhase?: number; // for oruga wave
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
  dodges?: number;
};

const EMPTY_STATS: GameStats = { caught: 0, missed: 0, maxCombo: 0, bosses: 0, gold: 0, dodges: 0 };

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

  const valueForBug = (kind: BugKind): number => {
    switch (kind) {
      case "jefe":
        return 25;
      case "dorado":
        return 10;
      case "bomba":
        return -5;
      case "mosquito":
        return 12;
      case "avispa":
        return 10;
      case "mosca":
        return 8;
      case "mariposa":
        return 6;
      case "abeja":
        return 5;
      case "araña":
        return 4;
      case "mariquita":
        return 3;
      case "hormiga":
        return 2;
      case "escarabajo":
        return 2;
      case "oruga":
      default:
        return 1;
    }
  };

  const spawn = useCallback((w: number, h: number, count = 1) => {
    const lvl = levelRef.current;
    const isLevel10 = lvl >= 10 || scoreRef.current >= 900;

    // En nivel 10 solo aparecen pocos bichos dispersos a hipervelocidad
    if (isLevel10) {
      const aliveCount = bugsRef.current.filter((b) => b.alive).length;
      if (aliveCount >= 3) return;
      count = Math.min(count, 3 - aliveCount);
      if (count <= 0) return;
    }

    for (let i = 0; i < count; i++) {
      const edge = Math.random() < 0.5;
      const r = 10 + Math.random() * 8;
      // Velocidad según el nivel del usuario
      const baseV = 1.0 + Math.random() * 0.8;
      let kind: BugKind = "oruga";

      // Pool de insectos estrictamente según velocidad y nivel
      const roll = Math.random();

      if (isLevel10) {
        // Nivel 10: Dominan mosquitos y avispas a velocidad ridícula
        kind = roll < 0.7 ? "mosquito" : "avispa";
      } else if (lvl === 1) {
        // Nivel 1: Orugas y escarabajos lentos
        kind = roll < 0.65 ? "oruga" : "escarabajo";
      } else if (lvl === 2) {
        // Nivel 2: Orugas, escarabajos y hormigas
        if (roll < 0.08) kind = "bomba";
        else if (roll < 0.15) kind = "dorado";
        else if (roll < 0.5) kind = "oruga";
        else if (roll < 0.75) kind = "escarabajo";
        else kind = "hormiga";
      } else if (lvl === 3) {
        // Nivel 3: Escarabajos, hormigas y mariquitas
        if (roll < 0.08) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.45) kind = "escarabajo";
        else if (roll < 0.75) kind = "hormiga";
        else kind = "mariquita";
      } else if (lvl === 4) {
        // Nivel 4: Hormigas, mariquitas y arañas
        if (roll < 0.09) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.45) kind = "hormiga";
        else if (roll < 0.75) kind = "mariquita";
        else kind = "araña";
      } else if (lvl === 5) {
        // Nivel 5: Mariquitas, arañas y abejas
        if (roll < 0.09) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.45) kind = "mariquita";
        else if (roll < 0.75) kind = "araña";
        else kind = "abeja";
      } else if (lvl === 6) {
        // Nivel 6: Arañas, abejas y mariposas
        if (roll < 0.1) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.45) kind = "araña";
        else if (roll < 0.72) kind = "abeja";
        else kind = "mariposa";
      } else if (lvl === 7) {
        // Nivel 7: Abejas, mariposas y moscas
        if (roll < 0.1) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.42) kind = "abeja";
        else if (roll < 0.7) kind = "mariposa";
        else kind = "mosca";
      } else if (lvl === 8) {
        // Nivel 8: Mariposas, moscas y avispas
        if (roll < 0.1) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.4) kind = "mariposa";
        else if (roll < 0.7) kind = "mosca";
        else kind = "avispa";
      } else {
        // Nivel 9: Moscas, avispas y mosquitos
        if (roll < 0.1) kind = "bomba";
        else if (roll < 0.16) kind = "dorado";
        else if (roll < 0.4) kind = "mosca";
        else if (roll < 0.7) kind = "avispa";
        else kind = "mosquito";
      }

      // Multiplicador de velocidad según tipo de bicho
      let speedFactor = 1.0;
      switch (kind) {
        case "oruga":
          speedFactor = 0.42;
          break;
        case "escarabajo":
          speedFactor = 0.58;
          break;
        case "hormiga":
          speedFactor = 0.88;
          break;
        case "mariquita":
          speedFactor = 1.15;
          break;
        case "araña":
          speedFactor = 1.45;
          break;
        case "abeja":
          speedFactor = 1.8;
          break;
        case "mariposa":
          speedFactor = 2.2;
          break;
        case "mosca":
          speedFactor = 2.8;
          break;
        case "avispa":
          speedFactor = 3.4;
          break;
        case "mosquito":
          speedFactor = isLevel10 ? 5.8 : 4.2; // hipervelocidad en nivel 10
          break;
        case "dorado":
          speedFactor = 1.3;
          break;
        case "bomba":
          speedFactor = 0.85;
          break;
      }

      const bugRadius =
        kind === "oruga"
          ? r * 1.25
          : kind === "escarabajo"
            ? r * 1.2
            : kind === "araña"
              ? r * 1.1
              : kind === "mariposa"
                ? r * 0.9
                : kind === "mosquito"
                  ? r * 0.75
                  : r;

      const bugSpeed = baseV * speedFactor * (1 + (lvl - 1) * 0.08);

      bugsRef.current.push({
        x: edge ? w * Math.random() : Math.random() < 0.5 ? -40 : w + 40,
        y: edge ? (Math.random() < 0.5 ? -40 : h + 40) : h * Math.random(),
        r: bugRadius,
        v: bugSpeed,
        a: Math.random() * Math.PI * 2,
        d: 0,
        alive: true,
        hue:
          kind === "dorado"
            ? 48
            : kind === "oruga"
              ? 95
              : kind === "escarabajo"
                ? 145
                : kind === "mariquita"
                  ? 0
                  : kind === "araña"
                    ? 10
                    : kind === "abeja"
                      ? 45
                      : kind === "mariposa"
                        ? 290
                        : kind === "mosca"
                          ? 210
                          : kind === "avispa"
                            ? 52
                            : kind === "mosquito"
                              ? 180
                              : 20,
        pop: 0,
        value: valueForBug(kind),
        kind,
        lives: 1,
        orbitAngle: Math.random() * Math.PI * 2,
        pauseTimer: 0,
        segmentPhase: 0,
      });
    }
  }, []);

  const spawnBoss = useCallback((w: number, h: number) => {
    bugsRef.current.push({
      x: w / 2,
      y: -80,
      r: 34,
      v: 0.75,
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
    floatersRef.current.push({ x, y, text, life: 1, color, dy: -1.3 });
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
        color: `hsl(${hue + (Math.random() * 30 - 15)} 85% ${55 + Math.random() * 20}%)`,
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
    spawn(cv.clientWidth, cv.clientHeight, 4);
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

  // ─── 10 FONDOS TEMÁTICOS PARA LOS 10 NIVELES ─────────────────────────────────

  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number, t: Theme, tick: number) => {
    if (t === "prado") {
      // Nivel 1: Prado Verde
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(200 80% 84%)");
      sky.addColorStop(0.55, "hsl(150 45% 78%)");
      sky.addColorStop(1, "hsl(120 50% 62%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "hsl(50 100% 75%)";
      ctx.beginPath();
      ctx.arc(w - 80, 80, 42, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        const fx = (i * 173) % (w || 1);
        const fy = h * 0.72 + ((i * 97) % Math.max(1, h * 0.25));
        ctx.fillStyle = `hsl(${(i * 47) % 360} 80% 75%)`;
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t === "jardin") {
      // Nivel 2: Jardín Floral
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(330 65% 88%)");
      sky.addColorStop(0.6, "hsl(300 40% 82%)");
      sky.addColorStop(1, "hsl(140 45% 65%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Pétalos flotando
      for (let i = 0; i < 16; i++) {
        const px = (i * 131 + tick * (0.6 + (i % 3) * 0.3)) % (w + 20);
        const py = (i * 87 + tick * (0.8 + (i % 4) * 0.2)) % (h + 20);
        ctx.fillStyle = `hsl(${340 + (i % 20)} 90% 80% / 0.75)`;
        ctx.beginPath();
        ctx.ellipse(px, py, 6, 3, Math.sin(tick / 20 + i), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t === "desierto") {
      // Nivel 3: Desierto Dorado
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(32 90% 78%)");
      sky.addColorStop(0.6, "hsl(28 85% 65%)");
      sky.addColorStop(1, "hsl(38 75% 55%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Sol ardiente
      ctx.fillStyle = "hsl(48 100% 70% / 0.85)";
      ctx.beginPath();
      ctx.arc(w * 0.75, 90, 55, 0, Math.PI * 2);
      ctx.fill();
      // Dunas
      ctx.fillStyle = "hsl(35 80% 48%)";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.75);
      ctx.quadraticCurveTo(w * 0.3, h * 0.65, w * 0.6, h * 0.8);
      ctx.quadraticCurveTo(w * 0.85, h * 0.88, w, h * 0.75);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    } else if (t === "playa") {
      // Nivel 4: Playa Tropical
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(195 90% 78%)");
      sky.addColorStop(0.55, "hsl(190 85% 70%)");
      sky.addColorStop(0.62, "hsl(45 80% 78%)");
      sky.addColorStop(1, "hsl(42 75% 68%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
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
    } else if (t === "bosque") {
      // Nivel 5: Bosque Encantado
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(160 50% 20%)");
      sky.addColorStop(0.6, "hsl(145 45% 35%)");
      sky.addColorStop(1, "hsl(135 60% 25%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Rayos de luz de bosque
      ctx.fillStyle = "hsl(60 80% 85% / 0.08)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const rx = w * 0.2 + i * (w * 0.22);
        ctx.moveTo(rx, 0);
        ctx.lineTo(rx + 40, 0);
        ctx.lineTo(rx - 80, h);
        ctx.lineTo(rx - 140, h);
        ctx.closePath();
        ctx.fill();
      }
    } else if (t === "pantano") {
      // Nivel 6: Pantano Místico
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(180 50% 14%)");
      sky.addColorStop(0.7, "hsl(150 40% 22%)");
      sky.addColorStop(1, "hsl(110 35% 18%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Luciérnagas verdes flotantes
      for (let i = 0; i < 14; i++) {
        const lx = (i * 157 + Math.sin(tick / 40 + i) * 35) % w;
        const ly = (i * 93 + Math.cos(tick / 35 + i) * 25) % h;
        const glow = 0.5 + 0.5 * Math.sin(tick / 25 + i * 1.5);
        ctx.fillStyle = `hsl(100 100% 65% / ${glow * 0.8})`;
        ctx.shadowColor = "hsl(100 100% 65%)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (t === "noche") {
      // Nivel 7: Noche Estrellada
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(250 45% 18%)");
      sky.addColorStop(1, "hsl(230 40% 32%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "hsl(55 60% 88%)";
      ctx.beginPath();
      ctx.arc(w - 90, 80, 38, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 35; i++) {
        const sx = (i * 197) % Math.max(1, w);
        const sy = (i * 113) % Math.max(1, h * 0.6);
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin(tick / 40 + i)) * 0.6;
        ctx.fillStyle = "hsl(60 80% 90%)";
        ctx.fillRect(sx, sy, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
    } else if (t === "artico") {
      // Nivel 8: Tundra Ártica
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(210 60% 20%)");
      sky.addColorStop(0.4, "hsl(200 55% 40%)");
      sky.addColorStop(1, "hsl(195 70% 82%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Nieve cayendo
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 193 + (tick * (0.4 + (i % 4) * 0.12))) % (w + 20)) - 10;
        const sy = ((i * 137 + tick * (0.6 + (i % 3) * 0.15)) % (h + 20)) - 10;
        ctx.fillStyle = "hsl(210 40% 98% / 0.85)";
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t === "volcan") {
      // Nivel 9: Volcán de Lava
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(10 65% 14%)");
      sky.addColorStop(0.5, "hsl(20 75% 24%)");
      sky.addColorStop(1, "hsl(25 85% 34%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Lava en el fondo
      const lavaGrad = ctx.createLinearGradient(0, h * 0.8, 0, h);
      lavaGrad.addColorStop(0, "hsl(25 100% 50%)");
      lavaGrad.addColorStop(1, "hsl(10 100% 35%)");
      ctx.fillStyle = lavaGrad;
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      // Brasas de fuego
      for (let i = 0; i < 18; i++) {
        const ex = (i * 97 + Math.sin(tick / 20 + i) * 20) % w;
        const ey = ((h * 0.85 - tick * (0.9 + (i % 4) * 0.2)) % h + h) % h;
        ctx.fillStyle = `hsl(${25 + (i % 20)} 100% 65% / 0.85)`;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Nivel 10: Cyber Glitch / Dimensión Imposible (Broma $10 USD)
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "hsl(285 85% 10%)");
      sky.addColorStop(0.5, "hsl(260 80% 16%)");
      sky.addColorStop(1, "hsl(230 90% 12%)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Rejilla cibernética animada en perspectiva
      ctx.strokeStyle = "hsl(310 100% 55% / 0.4)";
      ctx.lineWidth = 1.5;
      const gridY = h * 0.65;
      for (let y = gridY; y <= h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let x = 0; x <= w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, gridY);
        ctx.lineTo(w / 2 + (x - w / 2) * 2.5, h);
        ctx.stroke();
      }

      // Líneas de escaneo glitch
      if (Math.sin(tick / 8) > 0.4) {
        ctx.fillStyle = "hsl(180 100% 60% / 0.12)";
        const gy = ((tick * 4) % h);
        ctx.fillRect(0, gy, w, 6);
      }

      // Texto de fondo futurista
      ctx.save();
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = "hsl(320 100% 65% / 0.3)";
      ctx.textAlign = "center";
      ctx.fillText("⚡ NIVEL 10: VELOCIDAD IMPOSIBLE • PREMIO $10 USD ⚡", w / 2, 40);
      ctx.restore();
    }
  };

  // ─── DIBUJO DE INSECTOS ───────────────────────────────────────────────────────

  // 1. Oruga (Nivel 1 — La más lenta)
  const drawCaterpillar = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    const wave = Math.sin(p.d * 0.2) * 4;
    // 4 segmentos circulares ondulantes
    for (let i = 3; i >= 0; i--) {
      const segY = i * p.r * 0.55;
      const segX = Math.sin(p.d * 0.2 + i * 0.8) * wave;
      const segR = p.r * (0.85 - i * 0.08);
      ctx.fillStyle = i % 2 === 0 ? "hsl(95 75% 45%)" : "hsl(80 80% 50%)";
      ctx.beginPath();
      ctx.arc(segX, segY, Math.max(4, segR), 0, Math.PI * 2);
      ctx.fill();
    }
    // Cabeza
    ctx.fillStyle = "hsl(90 85% 40%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.35, p.r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    // Ojos
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-p.r * 0.3, -p.r * 0.45, p.r * 0.22, 0, Math.PI * 2);
    ctx.arc(p.r * 0.3, -p.r * 0.45, p.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-p.r * 0.3, -p.r * 0.45, p.r * 0.11, 0, Math.PI * 2);
    ctx.arc(p.r * 0.3, -p.r * 0.45, p.r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    // Antenas
    ctx.strokeStyle = "hsl(40 90% 50%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-p.r * 0.2, -p.r * 0.8);
    ctx.lineTo(-p.r * 0.45, -p.r * 1.2);
    ctx.moveTo(p.r * 0.2, -p.r * 0.8);
    ctx.lineTo(p.r * 0.45, -p.r * 1.2);
    ctx.stroke();
    ctx.restore();
  };

  // 2. Escarabajo (Nivel 2 — Lento y blindado)
  const drawBeetle = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Patas
    ctx.strokeStyle = "hsl(145 40% 15%)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yOff = (i - 1) * p.r * 0.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.5, yOff);
        ctx.lineTo(side * p.r * 1.4, yOff + Math.sin(p.d * 0.2 + i) * 3);
        ctx.stroke();
      }
    }
    // Caparazón esmeralda
    const elytraGrad = ctx.createRadialGradient(-p.r * 0.15, -p.r * 0.1, 0, 0, 0, p.r * 1.1);
    elytraGrad.addColorStop(0, "hsl(145 80% 55%)");
    elytraGrad.addColorStop(1, "hsl(180 60% 25%)");
    ctx.fillStyle = elytraGrad;
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.15, p.r * 0.7, p.r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    // Línea divisoria
    ctx.strokeStyle = "hsl(145 50% 20%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 0.7);
    ctx.lineTo(0, p.r * 1.05);
    ctx.stroke();
    // Cabeza y mandíbulas
    ctx.fillStyle = "hsl(145 70% 30%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.9, p.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 3. Hormiga (Nivel 3 — Estándar)
  const drawAnt = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Patas de hormiga
    ctx.strokeStyle = "hsl(20 15% 20%)";
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const yOff = (i - 1) * p.r * 0.45;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.3, yOff);
        ctx.lineTo(side * p.r * 1.25, yOff + Math.sin(p.d * 0.3 + i) * 4);
        ctx.stroke();
      }
    }
    // Abdomen
    ctx.fillStyle = "hsl(20 30% 20%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.65, p.r * 0.5, p.r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tórax
    ctx.fillStyle = "hsl(20 35% 26%)";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.35, p.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cabeza
    ctx.fillStyle = "hsl(20 40% 22%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.65, p.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Antenas
    ctx.strokeStyle = "hsl(20 20% 15%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-p.r * 0.2, -p.r * 0.9);
    ctx.lineTo(-p.r * 0.5, -p.r * 1.4);
    ctx.moveTo(p.r * 0.2, -p.r * 0.9);
    ctx.lineTo(p.r * 0.5, -p.r * 1.4);
    ctx.stroke();
    ctx.restore();
  };

  // 4. Mariquita (Nivel 4 — Velocidad media con lunares)
  const drawLadybug = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Patas
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const yOff = (i - 1) * p.r * 0.45;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.5, yOff);
        ctx.lineTo(side * p.r * 1.25, yOff + Math.sin(p.d * 0.3 + i) * 3);
        ctx.stroke();
      }
    }
    // Caparazón rojo
    ctx.fillStyle = "hsl(0 85% 50%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.1, p.r * 0.8, p.r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // Línea central negra
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 0.6);
    ctx.lineTo(0, p.r * 0.9);
    ctx.stroke();
    // Puntos negros
    ctx.fillStyle = "#111";
    const spots = [
      [-p.r * 0.4, -p.r * 0.2],
      [p.r * 0.4, -p.r * 0.2],
      [-p.r * 0.45, p.r * 0.3],
      [p.r * 0.45, p.r * 0.3],
      [-p.r * 0.2, p.r * 0.6],
      [p.r * 0.2, p.r * 0.6],
    ];
    for (const [sx, sy] of spots) {
      ctx.beginPath();
      ctx.arc(sx, sy, p.r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cabeza negra
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.7, p.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 5. Araña (Nivel 5 — Rápida con pausas y piques)
  const drawSpider = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    ctx.strokeStyle = "hsl(0 5% 18%)";
    ctx.lineWidth = 1.8;
    const wob = Math.sin(p.d * 0.3) * p.r * 0.25;
    for (let i = 0; i < 4; i++) {
      const yOff = ((i - 1.5) / 1.5) * p.r * 0.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.5, yOff);
        ctx.quadraticCurveTo(side * p.r * 1.1, yOff + wob * (i % 2 === 0 ? 1 : -1), side * p.r * 1.6, yOff + p.r * 0.3 * side);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "hsl(0 10% 12%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.65, p.r * 0.7, p.r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "hsl(0 80% 50%)"; // Marca roja
    ctx.beginPath();
    ctx.arc(0, p.r * 0.5, p.r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "hsl(0 8% 22%)";
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.1, p.r * 0.55, p.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 6. Abeja (Nivel 6 — Vuelo rápido orbital)
  const drawBee = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Alas que aletean
    const flutter = Math.sin(p.d * 0.5) * 0.25;
    ctx.fillStyle = "hsl(200 70% 85% / 0.6)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * p.r * 0.8, -p.r * 0.4, p.r * 0.7, p.r * 0.35, flutter * side, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rayas amarillas y negras
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? "hsl(45 100% 50%)" : "hsl(0 0% 10%)";
      ctx.beginPath();
      ctx.ellipse(0, -p.r * 0.2 + i * p.r * 0.4, p.r * (0.55 - Math.abs(i - 1.5) * 0.08), p.r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cabeza
    ctx.fillStyle = "hsl(45 80% 30%)";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.7, p.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 7. Mariposa (Nivel 7 — Rápida y zigzagueante)
  const drawButterfly = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    const wingFlap = Math.sin(p.d * 0.35) * 0.3;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = `hsl(${p.hue} 75% 65%)`;
      ctx.beginPath();
      ctx.ellipse(p.r * 0.9, -p.r * 0.2, p.r * 0.9, p.r * 0.55, -0.4 + wingFlap * side, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${p.hue + 25} 70% 60%)`;
      ctx.beginPath();
      ctx.ellipse(p.r * 0.75, p.r * 0.35, p.r * 0.65, p.r * 0.38, 0.5 + wingFlap * side, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Cuerpo
    ctx.fillStyle = "hsl(280 40% 20%)";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.18, p.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 8. Mosca (Nivel 8 — Muy veloz y errática)
  const drawFly = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Alas de zumbido rápido
    const flutter = Math.sin(p.d * 0.8) * 0.3;
    ctx.fillStyle = "hsl(190 70% 85% / 0.55)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * p.r * 0.75, -p.r * 0.3, p.r * 0.7, p.r * 0.28, flutter * side, 0, Math.PI * 2);
      ctx.fill();
    }
    // Patitas
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const yOff = (i - 1) * p.r * 0.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.3, yOff);
        ctx.lineTo(side * p.r * 1.1, yOff + Math.sin(p.d * 0.4 + i) * 3);
        ctx.stroke();
      }
    }
    // Cuerpo gris metálico
    ctx.fillStyle = "hsl(215 30% 25%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.2, p.r * 0.45, p.r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ojos rojos gigantes compuestos
    ctx.fillStyle = "hsl(0 90% 50%)";
    ctx.beginPath();
    ctx.arc(-p.r * 0.25, -p.r * 0.45, p.r * 0.26, 0, Math.PI * 2);
    ctx.arc(p.r * 0.25, -p.r * 0.45, p.r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 9. Avispa (Nivel 9 — Súper veloz y afilada)
  const drawWasp = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Alas alargadas
    ctx.fillStyle = "hsl(40 80% 85% / 0.6)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * p.r * 0.85, -p.r * 0.45, p.r * 0.85, p.r * 0.25, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Abdomen puntiagudo con aguijón
    ctx.fillStyle = "hsl(52 100% 50%)";
    ctx.beginPath();
    ctx.moveTo(0, p.r * 1.1); // aguijón
    ctx.lineTo(-p.r * 0.4, p.r * 0.3);
    ctx.lineTo(p.r * 0.4, p.r * 0.3);
    ctx.closePath();
    ctx.fill();
    // Rayas negras en aguijón
    ctx.fillStyle = "#111";
    ctx.fillRect(-p.r * 0.3, p.r * 0.5, p.r * 0.6, p.r * 0.18);
    // Tórax y cabeza
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.35, p.r * 0.35, 0, 0, Math.PI * 2);
    ctx.arc(0, -p.r * 0.6, p.r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // 10. Mosquito (Nivel 10 — Hipervelocidad imposible)
  const drawMosquito = (ctx: CanvasRenderingContext2D, p: Bug) => {
    const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.scale(s, s);
    ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;

    // Resplandor de hipervelocidad en nivel 10
    if (levelRef.current >= 10 || scoreRef.current >= 900) {
      ctx.shadowColor = "hsl(180 100% 60%)";
      ctx.shadowBlur = 12;
    }

    // Patas finas y larguísimas
    ctx.strokeStyle = "hsl(200 20% 25%)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const yOff = (i - 1) * p.r * 0.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.r * 0.2, yOff);
        ctx.lineTo(side * p.r * 1.6, yOff + (i % 2 === 0 ? -p.r * 0.6 : p.r * 0.6));
        ctx.stroke();
      }
    }
    // Alas difusas por altísima vibración
    const flutter = Math.sin(p.d * 1.5) * 0.4;
    ctx.fillStyle = "hsl(190 80% 85% / 0.45)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * p.r * 0.7, -p.r * 0.3, p.r * 0.8, p.r * 0.2, flutter * side, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cuerpo alargado fino
    ctx.fillStyle = "hsl(200 15% 20%)";
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.2, p.r * 0.18, p.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cabeza con aguja picadora larga
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.5, p.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // Trompa/aguja
    ctx.strokeStyle = "hsl(0 80% 45%)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 0.7);
    ctx.lineTo(0, -p.r * 1.6);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  };

  const drawBug = (ctx: CanvasRenderingContext2D, p: Bug) => {
    switch (p.kind) {
      case "oruga":
        drawCaterpillar(ctx, p);
        return;
      case "escarabajo":
        drawBeetle(ctx, p);
        return;
      case "hormiga":
        drawAnt(ctx, p);
        return;
      case "mariquita":
        drawLadybug(ctx, p);
        return;
      case "araña":
        drawSpider(ctx, p);
        return;
      case "abeja":
        drawBee(ctx, p);
        return;
      case "mariposa":
        drawButterfly(ctx, p);
        return;
      case "mosca":
        drawFly(ctx, p);
        return;
      case "avispa":
        drawWasp(ctx, p);
        return;
      case "mosquito":
        drawMosquito(ctx, p);
        return;
      case "bomba": {
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
      case "dorado": {
        // Bicho dorado resplandeciente
        const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.scale(s, s);
        ctx.shadowColor = "hsl(48 100% 60%)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "hsl(48 100% 55%)";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 0.6, p.r * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-p.r * 0.15, -p.r * 0.25, p.r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        return;
      }
      case "jefe":
      default: {
        const s = p.pop > 0 ? 1 + p.pop * 0.6 : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.scale(s, s);
        ctx.globalAlpha = p.pop > 0 ? Math.max(0, 1 - p.pop) : 1;
        ctx.shadowColor = "hsl(350 90% 50%)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "hsl(350 85% 45%)";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 0.7, p.r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        // Corona de jefe
        ctx.font = `${p.r * 0.9}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👑", 0, -p.r * 0.9);
        ctx.shadowBlur = 0;
        ctx.restore();
        return;
      }
    }
  };

  const drawPowerUp = (ctx: CanvasRenderingContext2D, p: PowerUp) => {
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(p.bob) * 5);
    const emoji = p.type === "time" ? "⏰" : p.type === "freeze" ? "❄️" : "⚡";
    ctx.font = `${p.r * 1.5}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  };

  const drawFloater = (ctx: CanvasRenderingContext2D, f: Floater) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  };

  // ─── GAME LOOP ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      cv.width = cv.clientWidth * window.devicePixelRatio;
      cv.height = cv.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
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
        const lvl = levelRef.current;
        const isLevel10 = lvl >= 10 || scoreRef.current >= 900;
        // Intervalo de spawn: en nivel 10 es más lento para tener solo unos cuantos dispersos
        const targetInterval = isLevel10 ? 1.8 : Math.max(0.65, 2.0 - lvl * 0.12);

        if (spawnTimerRef.current > targetInterval) {
          spawnTimerRef.current = 0;
          spawn(w, h, isLevel10 ? 1 : Math.min(3, 1 + Math.floor(lvl / 3)));
        }

        // Jefe en niveles 3, 6, 9
        if (lvl >= 3 && lvl < 10 && lvl % 3 === 0 && lastBossLevelRef.current !== lvl) {
          const bossAlive = bugsRef.current.some((b) => b.kind === "jefe" && b.alive);
          if (!bossAlive) {
            lastBossLevelRef.current = lvl;
            spawnBoss(w, h);
          }
        }

        powerUpTimerRef.current += 1 / 60;
        if (powerUpTimerRef.current > 9 + Math.random() * 8) {
          powerUpTimerRef.current = 0;
          if (powerUpsRef.current.length < 2 && !isLevel10) spawnPowerUp(w, h);
        }
      }

      for (const p of bugsRef.current) {
        if (p.alive && playing) {
          const speedMul = activeEffectsRef.current.freeze > 0 ? 0.3 : 1;

          if (p.kind === "mariposa" || p.kind === "mosca") {
            p.a += (Math.random() * 2 - 1) * 0.22;
            p.orbitAngle += 0.12;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
            p.x += Math.sin(p.orbitAngle) * 2.0 * speedMul;
          } else if (p.kind === "araña") {
            p.pauseTimer -= 1 / 60;
            if (p.pauseTimer <= 0) {
              if (Math.random() < 0.3) {
                p.pauseTimer = 0.5 + Math.random() * 0.6;
                p.v = 0.05;
              } else {
                p.pauseTimer = 0.3 + Math.random() * 0.4;
                p.v = (2.2 + Math.random() * 1.5) * (1 + (levelRef.current - 1) * 0.08);
                p.a = Math.random() * Math.PI * 2;
              }
            }
            p.a += (Math.random() * 2 - 1) * 0.06;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
          } else if (p.kind === "abeja") {
            p.orbitAngle += 0.06 * speedMul;
            p.a += (Math.random() * 2 - 1) * 0.06;
            p.x += p.v * Math.sin(p.a) * speedMul + Math.cos(p.orbitAngle) * 1.4 * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul + Math.sin(p.orbitAngle) * 1.4 * speedMul;
          } else if (p.kind === "mosquito") {
            // Zumbido hiper-rápido en zigzag con cambios violentos
            p.a += (Math.random() * 2 - 1) * 0.35;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
          } else {
            const turnSpeed = p.kind === "jefe" || p.kind === "escarabajo" || p.kind === "oruga" ? 0.03 : 0.08;
            p.a += (Math.random() * 2 - 1) * turnSpeed;
            p.x += p.v * Math.sin(p.a) * speedMul;
            p.y -= p.v * Math.cos(p.a) * speedMul;
          }

          p.d += p.v * speedMul;

          // Rebote en bordes de pantalla
          if (p.x < -25) p.a = Math.PI / 2 + (Math.random() - 0.5);
          if (p.x > w + 25) p.a = -Math.PI / 2 + (Math.random() - 0.5);
          if (p.y < -25) p.a = Math.PI + (Math.random() - 0.5);
          if (p.y > h + 25) p.a = Math.random() - 0.5;
        }

        if (!p.alive) p.pop += 0.06;
        if (p.pop < 1) drawBug(ctx, p);
      }
      bugsRef.current = bugsRef.current.filter((p) => p.pop < 1);

      for (const p of powerUpsRef.current) {
        if (playing) p.bob += 0.08;
        if (p.alive) drawPowerUp(ctx, p);
      }

      // Partículas
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

      // Flotadores de puntos
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
  }, [spawn, spawnBoss, spawnPowerUp, timeLeft]);

  // ─── MANEJO DE TOQUES CON MECÁNICA DE BROMA (NIVEL 10 / 900+ PTS) ─────────────

  const tap = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv || stateRef.current !== "playing" || pausedRef.current) return;
    const rect = cv.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const isLevel10 = levelRef.current >= 10 || scoreRef.current >= 900;

    // Power-ups
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

    // MECÁNICA DE ESQUIVA EN NIVEL 10 (900+ PUNTOS)
    // Los insectos esquivan automáticamente cuando intentas tocarlos
    let anyDodged = false;
    if (isLevel10) {
      for (const p of bugsRef.current) {
        if (!p.alive || p.kind === "bomba") continue;
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < 130) {
          // El mosquito o insecto esquiva a la velocidad de la luz
          const angle = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5);
          p.x += Math.cos(angle) * (140 + Math.random() * 120);
          p.y += Math.sin(angle) * (140 + Math.random() * 120);
          p.v = Math.max(p.v, 6.5);
          burst(x, y, 180, 10);
          sfx.dodge();
          anyDodged = true;
          const jokeTexts = [
            "¡ESQUIVADO! 💨",
            "¡MUY LENTO! ⚡",
            "¡CASI! 🏃💨",
            "¡A 1 PTO DE LOS $10! 💸",
            "¡NI DE CHISTE! 🦟",
          ];
          addFloater(
            x,
            y - 15,
            jokeTexts[Math.floor(Math.random() * jokeTexts.length)] ?? "¡ESQUIVADO! 💨",
            "oklch(0.7 0.25 180)",
          );
        }
      }
      if (anyDodged) {
        statsRef.current.missed += 1;
        statsRef.current.dodges = (statsRef.current.dodges ?? 0) + 1;
        return;
      }
    }

    let hits = 0;
    let gained = 0;
    let bombHit = false;
    let bossKilled = false;

    for (const p of bugsRef.current) {
      if (!p.alive) continue;
      const dist = Math.hypot(p.x - x, p.y - y);
      const hitMul =
        p.kind === "mosquito"
          ? 1.3
          : p.kind === "mariposa" || p.kind === "mosca"
            ? 1.6
            : p.kind === "araña"
              ? 2.5
              : p.kind === "escarabajo" || p.kind === "oruga"
                ? 2.2
                : 2.0;

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
        burst(p.x, p.y, p.hue, p.kind === "jefe" ? 26 : 14);
      } else if (dist < 140 && p.kind !== "bomba") {
        // Asustar insectos cercanos
        p.v = Math.min(8, p.v * 1.5);
        p.a = Math.atan2(p.x - x, y - p.y) + (Math.random() - 0.5);
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

      // TRUCO DE LA BROMA: La puntuación máxima permitida en el juego es estrictamente 999 puntos
      const currentScore = scoreRef.current;
      if (currentScore >= 999) {
        addFloater(x, y - 20, "¡999 MÁXIMO! 😂", "oklch(0.7 0.25 40)");
        addFloater(x, y - 50, "¡A 1 punto de $10 USD! 💸", "oklch(0.75 0.2 85)");
        return;
      }

      const cappedGained = Math.min(gained, 999 - currentScore);
      onScore(cappedGained);

      addFloater(x, y - 20, `+${cappedGained}`, "oklch(0.65 0.2 30)");
      if (currentScore + cappedGained >= 999) {
        addFloater(x, y - 55, "¡¡CASI 1000!! 😱", "oklch(0.7 0.25 40)");
      }
      if (bossKilled) addFloater(x, y - 80, "¡JEFE ATRAPADO! 👑", "oklch(0.7 0.2 350)");
      if (comboRef.current > 1) {
        addFloater(x, y - 50, `Combo x${comboRef.current}`, "oklch(0.7 0.18 300)");
      }

      spawn(cv.clientWidth, cv.clientHeight, isLevel10 ? 1 : hits + 1);
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
