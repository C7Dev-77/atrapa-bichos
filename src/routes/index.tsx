import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AntGame,
  getSecondsForLevel,
  LEVEL_SECONDS,
  MAX_BUGS_PER_LEVEL,
  type GameState,
  type GameStats,
  type Theme,
} from "@/components/AntGame";
import { ensureAudio, isMuted, setMuted, sfx, startMusic, stopMusic } from "@/lib/sound";
import { fetchGlobalScores, submitScore } from "@/lib/leaderboard";
import { getOrCreateUuid } from "@/lib/uuid";
import type { ScoreEntry } from "@/lib/leaderboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atrapa Bichos — Desafío 10 Niveles por C7Dev_" },
      {
        name: "description",
        content:
          "Juego web arcade de reflejos: supera los 10 niveles con tiempo decreciente, atrapa insectos cada vez más veloces y compite por el récord de 1000 puntos creado por C7Dev_.",
      },
      { property: "og:title", content: "Atrapa Bichos — Desafío 10 Niveles por C7Dev_" },
      {
        property: "og:description",
        content:
          "Toca los bichos, esquiva bombas, supera 10 niveles y reclama tu récord. ¿Podrás alcanzar los 1000 puntos?",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EMPTY_STATS: GameStats = { caught: 0, missed: 0, maxCombo: 0, bosses: 0, gold: 0, dodges: 0 };

// 10 escenas temáticas para los 10 niveles
const THEMES: Theme[] = [
  "prado",
  "jardin",
  "desierto",
  "playa",
  "bosque",
  "pantano",
  "noche",
  "artico",
  "volcan",
  "cyber",
];

const THEME_NAMES: Record<Theme, string> = {
  prado: "Prado Verde",
  jardin: "Jardín Floral",
  desierto: "Desierto Dorado",
  playa: "Playa Tropical",
  bosque: "Bosque Encantado",
  pantano: "Pantano Místico",
  noche: "Noche Estrellada",
  artico: "Tundra Ártica",
  volcan: "Volcán Ardiente",
  cyber: "Dimensión Imposible ⚡",
};

const THEME_ICONS: Record<Theme, string> = {
  prado: "🌿",
  jardin: "🌸",
  desierto: "🏜️",
  playa: "🏖️",
  bosque: "🌲",
  pantano: "🍄",
  noche: "🌙",
  artico: "❄️",
  volcan: "🌋",
  cyber: "⚡",
};

const MISSION_TARGET = 30;

type BoardEntry = { name: string; score: number };
type Toast = { id: number; text: string };

type Achievement = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  test: (ctx: { stats: GameStats; score: number; accuracy: number; combo: number; level: number }) => boolean;
};

const ACHIEVEMENTS: Achievement[] = [
  { id: "first", icon: "🐛", name: "Primer bichito", desc: "Atrapa tu primer bicho", test: ({ stats }) => stats.caught >= 1 },
  { id: "combo5", icon: "🔥", name: "Combo x5", desc: "Consigue un combo de 5", test: ({ stats, combo }) => stats.maxCombo >= 5 || combo >= 5 },
  { id: "combo10", icon: "⚡", name: "Combo x10", desc: "Consigue un combo de 10", test: ({ stats, combo }) => stats.maxCombo >= 10 || combo >= 10 },
  { id: "score100", icon: "💯", name: "Cien puntos", desc: "Supera el Nivel 1 (100 puntos)", test: ({ score }) => score >= 100 },
  { id: "score300", icon: "🌟", name: "Nivel 4 Alcanzado", desc: "Consigue 300 puntos en una partida", test: ({ score }) => score >= 300 },
  { id: "gold", icon: "✨", name: "Bicho dorado", desc: "Atrapa un bicho dorado", test: ({ stats }) => stats.gold >= 1 },
  { id: "boss", icon: "👑", name: "Cazador de jefes", desc: "Atrapa a un bicho jefe", test: ({ stats }) => stats.bosses >= 1 },
  { id: "sharp", icon: "🎯", name: "Puntería experta", desc: "90% de precisión con 10+ toques", test: ({ stats, accuracy }) => accuracy >= 90 && stats.caught + stats.missed >= 10 },
  { id: "level5", icon: "🚀", name: "Mitad de camino", desc: "Llega al nivel 5 (Bosque Encantado)", test: ({ level }) => level >= 5 },
  { id: "level10", icon: "⚡", name: "Dimensión Imposible", desc: "Llega al nivel 10 (900+ puntos)", test: ({ level }) => level >= 10 },
  { id: "near1000", icon: "💸", name: "A un pelo del Premio", desc: "Supera los 900 puntos en el Nivel 10", test: ({ score }) => score >= 900 },
  { id: "max999", icon: "🏆", name: "Cazador Legendario", desc: "Alcanza la puntuación más alta en el Nivel 10", test: ({ score }) => score >= 999 },
];

function missionKey() {
  return `ab-mission-${new Date().toISOString().slice(0, 10)}`;
}

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 12) * 0.12,
    hue: (i * 61) % 360,
    size: 6 + (i % 4) * 3,
    dur: 2.5 + (i % 5) * 0.4,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute -top-4 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: `hsl(${p.hue} 85% 60%)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Global leaderboard hook ────────────────────────────────────────────────

function useGlobalBoard() {
  const [rows, setRows] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchGlobalScores();
      if (!result.ok) throw new Error("not ok");
      setRows(result.scores ?? []);
      setAvailable(true);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  return { rows, loading, available, fetch };
}

async function postScore(name: string, score: number) {
  const uuid = getOrCreateUuid();
  try {
    await submitScore({ data: { uuid, name, score } });
  } catch {
    // silently ignore — local table is already saved
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

function Index() {
  const [state, setState] = useState<GameState>("idle");
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(getSecondsForLevel(1)); // Nivel 1: 45s
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState<GameStats>({ ...EMPTY_STATS });
  const [liveStats, setLiveStats] = useState<GameStats>({ ...EMPTY_STATS });
  const [muted, setMutedState] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confetti, setConfetti] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [boardSaved, setBoardSaved] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showBoard, setShowBoard] = useState(false);
  const [boardTab, setBoardTab] = useState<"local" | "global">("local");
  const [showAchievements, setShowAchievements] = useState(false);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [missionCount, setMissionCount] = useState(0);
  const [missionDone, setMissionDone] = useState(false);
  const toastId = useRef(0);
  const globalBoard = useGlobalBoard();

  // Modal del anuncio publicitario de los $10 USD
  const [showAdModal, setShowAdModal] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  // 10 Niveles basados en puntuación (cada 100 puntos sube de nivel)
  const level = state === "playing" || state === "over" ? Math.min(10, Math.floor(score / 100) + 1) : 1;
  const theme: Theme = THEMES[level - 1] ?? "prado";
  const prevLevelRef = useRef(1);

  const pushToast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  // Carga inicial
  useEffect(() => {
    const stored = Number(localStorage.getItem("atrapa-bichos-best") ?? 0);
    if (stored) setBest(stored);
    try {
      setBoard(JSON.parse(localStorage.getItem("ab-board") ?? "[]") as BoardEntry[]);
      setUnlocked(JSON.parse(localStorage.getItem("ab-ach") ?? "[]") as string[]);
    } catch {
      /* noop */
    }
    const mc = Number(localStorage.getItem(missionKey()) ?? 0);
    setMissionCount(mc);
    setMissionDone(mc >= MISSION_TARGET);
    setMutedState(isMuted());

    // Mostrar el anuncio llamativo de los $10 USD al abrir la app
    setShowAdModal(true);
    setAdCountdown(3);
    sfx.cash();
  }, []);

  // Cuenta atrás del anuncio publicitario
  useEffect(() => {
    if (!showAdModal || adCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setAdCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showAdModal, adCountdown]);

  // REGLA: TIEMPO DECRECIENTE POR NIVEL
  // Nivel 1: 45s, Nivel 2: 43s, Nivel 3: 41s ... Nivel 10: 25s
  useEffect(() => {
    if (state === "playing" && level > prevLevelRef.current) {
      const nextSeconds = getSecondsForLevel(level);
      setTimeLeft(nextSeconds);
      pushToast(`🚀 ¡NIVEL ${level}! ${THEME_ICONS[theme]} ${THEME_NAMES[theme]} (+${nextSeconds}s ⏱️)`);
      sfx.levelUp();
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 2400);
    }
    prevLevelRef.current = level;
  }, [level, state, pushToast, theme]);

  // Logros en vivo
  useEffect(() => {
    if (state !== "playing") return;
    const hit = ACHIEVEMENTS.filter(
      (a) =>
        !unlocked.includes(a.id) &&
        a.test({ stats: liveStats, score, accuracy: 0, combo, level }),
    );
    if (hit.length) {
      const next = [...unlocked, ...hit.map((a) => a.id)];
      setUnlocked(next);
      localStorage.setItem("ab-ach", JSON.stringify(next));
      hit.forEach((a) => pushToast(`🏆 ¡Logro: ${a.name}!`));
      sfx.achievement();
    }
  }, [combo, state, unlocked, liveStats, score, level, pushToast]);

  // Fin de partida
  useEffect(() => {
    if (state !== "over") return;
    stopMusic();

    const accuracy =
      stats.caught + stats.missed > 0 ? Math.round((stats.caught / (stats.caught + stats.missed)) * 100) : 0;

    const isBest = score > best;
    setNewBest(isBest);
    if (isBest) {
      setBest(score);
      localStorage.setItem("atrapa-bichos-best", String(score));
      sfx.record();
      setConfetti(true);
    } else {
      sfx.gameOver();
    }

    // Misión diaria
    const newCount = missionCount + stats.caught;
    setMissionCount(newCount);
    localStorage.setItem(missionKey(), String(newCount));
    if (!missionDone && newCount >= MISSION_TARGET) {
      setMissionDone(true);
      pushToast("🎯 ¡Misión diaria completada!");
      sfx.achievement();
      setConfetti(true);
    }

    // Logros finales
    const hit = ACHIEVEMENTS.filter(
      (a) => !unlocked.includes(a.id) && a.test({ stats, score, accuracy, combo: 0, level }),
    );
    if (hit.length) {
      const next = [...unlocked, ...hit.map((a) => a.id)];
      setUnlocked(next);
      localStorage.setItem("ab-ach", JSON.stringify(next));
      hit.forEach((a) => pushToast(`🏆 ¡Logro: ${a.name}!`));
    }
    setBoardSaved(false);
    setNameInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = () => {
    ensureAudio();
    setScore(0);
    setTimeLeft(getSecondsForLevel(1)); // 45 segundos para el Nivel 1
    setCombo(0);
    setPaused(false);
    setStats({ ...EMPTY_STATS });
    setLiveStats({ ...EMPTY_STATS });
    setConfetti(false);
    setNewBest(false);
    prevLevelRef.current = 1;
    setState("playing");
    startMusic();
  };

  const handleStartWithAd = () => {
    setShowAdModal(true);
    setAdCountdown(3);
    sfx.cash();
  };

  // La puntuación avanza libremente hasta el máximo absoluto de 999 puntos
  const onScore = useCallback((n: number) => setScore((s) => Math.min(999, Math.max(0, s + n))), []);
  const onTick = useCallback((d: number) => setTimeLeft((t) => Math.max(0, t + d)), []);
  const onComboChange = useCallback((c: number) => setCombo(c), []);
  const onStats = useCallback((s: GameStats) => setStats(s), []);
  const onCaught = useCallback((s: GameStats) => setLiveStats(s), []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next && state === "playing" && !paused) startMusic();
  };

  useEffect(() => {
    if (paused) stopMusic();
    else if (state === "playing" && !muted) startMusic();
  }, [paused, state, muted]);

  const accuracy =
    stats.caught + stats.missed > 0 ? Math.round((stats.caught / (stats.caught + stats.missed)) * 100) : 0;

  const qualifies = score > 0;

  const GAME_URL = "https://atrapa-bichos.vercel.app";

  const saveToBoard = async () => {
    const name = (nameInput.trim() || "CRIST").toUpperCase().slice(0, 5);
    const next = [...board, { name, score }].sort((a, b) => b.score - a.score).slice(0, 10);
    setBoard(next);
    localStorage.setItem("ab-board", JSON.stringify(next));
    setBoardSaved(true);
    await postScore(name, score);
    await globalBoard.fetch();
    pushToast("✅ ¡Puntaje guardado en el Ranking Global!");
  };

  const openBoard = (tab: "local" | "global") => {
    setBoardTab(tab);
    setShowBoard(true);
    if (tab === "global") globalBoard.fetch();
  };

  // Compartir en Redes Sociales (Facebook, TikTok y Copiar con puntuación + texto + enlace oficial de Vercel)
  const shareText =
    score === 999
      ? `¡INCREÍBLE! Logré 999 PUNTOS en Atrapa Bichos de @C7Dev-77 y estuve a solo 1 punto de los $10 USD 😱💸 ¿Podrás superarme?`
      : score >= 900
        ? `¡Casi gano los $10 USD! Logré ${score} puntos en Atrapa Bichos de @C7Dev-77 en el Nivel 10 😱💸 ¿Podrás superarme?`
        : `¡Logré ${score} puntos en Atrapa Bichos de @C7Dev-77 y alcancé el Nivel ${level} (${THEME_NAMES[theme]})! 🎯 ¿Puedes superarme?`;

  const getFullSharePayload = () => {
    return `${shareText}\n🎮 Juega gratis aquí: ${GAME_URL}`;
  };

  const shareOnFacebook = () => {
    const payload = getFullSharePayload();
    void navigator.clipboard.writeText(payload);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(GAME_URL)}&quote=${encodeURIComponent(payload)}`,
      "_blank",
      "noopener,noreferrer,width=620,height=580"
    );
  };

  const shareOnTikTok = () => {
    const payload = getFullSharePayload();
    void navigator.clipboard.writeText(payload);
    pushToast("📋 ¡Copiado! Pégalo en tu TikTok 🎵");
    window.open("https://www.tiktok.com/", "_blank", "noopener,noreferrer");
  };

  const copyShareLink = () => {
    const payload = getFullSharePayload();
    void navigator.clipboard.writeText(payload);
    pushToast("📋 ¡Puntuación + texto + enlace copiados!");
  };

  const missionProgress = Math.min(100, Math.round((missionCount / MISSION_TARGET) * 100));

  return (
    <main className="relative h-[100dvh] w-full min-h-screen overflow-hidden bg-meadow select-none">
      <AntGame
        state={state}
        paused={paused}
        onStateChange={setState}
        onScore={onScore}
        score={score}
        timeLeft={timeLeft}
        onTick={onTick}
        onComboChange={onComboChange}
        onStats={onStats}
        onCaught={onCaught}
        level={level}
        theme={theme}
      />

      {confetti && <Confetti />}

      {/* HUD SUPERIOR */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-5 z-10">
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Puntuación */}
          <div className="rounded-2xl sm:rounded-3xl bg-card/90 px-4 py-2 sm:px-5 sm:py-3 shadow-toy backdrop-blur-sm border border-border/50">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground">Puntos</p>
            <div className="flex items-baseline gap-1.5">
              <p className="font-display text-3xl sm:text-4xl leading-none text-primary">{score}</p>
              <span className="text-[11px] sm:text-xs font-bold text-muted-foreground">/ 1,000 pts</span>
            </div>
          </div>

          {/* Nivel y Escenario */}
          {state === "playing" && (
            <div className="rounded-full bg-card/90 px-3 py-1 sm:px-4 sm:py-1.5 text-center shadow-toy backdrop-blur-sm border border-border/50">
              <p className="text-xs sm:text-sm font-bold text-foreground">
                Nivel {level}/10 • {THEME_ICONS[theme]} {THEME_NAMES[theme]}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 sm:gap-2">
          <div className="flex gap-2">
            <button
              id="btn-mute"
              onClick={toggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="pointer-events-auto rounded-full bg-card/90 px-3 py-1.5 sm:px-4 sm:py-2 font-bold text-foreground shadow-toy transition-transform active:scale-95 hover:bg-card border border-border/50 text-sm sm:text-base"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {state === "playing" && (
              <button
                id="btn-pause"
                onClick={() => setPaused((p) => !p)}
                className="pointer-events-auto rounded-full bg-card/90 px-3 py-1.5 sm:px-4 sm:py-2 font-bold text-foreground shadow-toy transition-transform active:scale-95 hover:bg-card border border-border/50 text-sm sm:text-base"
              >
                {paused ? "▶ Seguir" : "⏸ Pausa"}
              </button>
            )}
          </div>

          {/* Temporizador de nivel con tiempo reducido por nivel */}
          <div className={`rounded-2xl sm:rounded-3xl px-4 py-2 sm:px-5 sm:py-3 text-right shadow-toy backdrop-blur-sm border transition-colors ${timeLeft <= 8 ? "bg-destructive/90 text-destructive-foreground border-destructive animate-pulse" : "bg-card/90 border-border/50"}`}>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-80">
              Tiempo Restante
            </p>
            <p className="font-display text-3xl sm:text-4xl leading-none">{timeLeft}s</p>
          </div>
        </div>
      </div>

      {/* Notificaciones Toasts */}
      <div className="pointer-events-none absolute top-24 sm:top-28 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-full bg-primary px-5 py-2 shadow-toy animate-enter text-center border-2 border-primary-foreground/20">
            <p className="font-display text-base sm:text-lg text-primary-foreground">{t.text}</p>
          </div>
        ))}
      </div>

      {/* Banner de Combo */}
      {state === "playing" && combo > 1 && (
        <div className="pointer-events-none absolute top-20 sm:top-24 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 sm:px-5 sm:py-2 shadow-toy animate-bounce z-20">
          <p className="font-display text-lg sm:text-xl text-primary-foreground">Combo x{combo} 🔥</p>
        </div>
      )}

      {/* Pausa */}
      {state === "playing" && paused && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] bg-card p-8 text-center shadow-toy border border-border">
            <p className="font-display text-5xl text-primary">Pausa</p>
            <p className="mt-2 text-base text-muted-foreground">Toma un respiro y prepárate</p>
            <button
              id="btn-resume"
              onClick={() => setPaused(false)}
              className="mt-6 w-full rounded-full bg-primary px-8 py-3.5 font-display text-xl text-primary-foreground shadow-toy transition-transform active:scale-95 hover:brightness-110"
            >
              ▶ Continuar Partida
            </button>
            <button
              id="btn-exit-pause"
              onClick={() => setState("idle")}
              className="mt-3 w-full rounded-full border-2 border-border bg-background px-8 py-2.5 font-display text-lg text-foreground transition-colors hover:bg-accent"
            >
              Salir al menú
            </button>
          </div>
        </div>
      )}

      {/* ─── PANTALLA DE ANUNCIO AMPLIA, COMPACTA Y CON FONDO BLANCO ─── */}
      {showAdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 md:p-6 backdrop-blur-sm animate-enter">
          <div className="relative flex max-h-[94dvh] w-[96%] sm:w-full max-w-4xl flex-col justify-between rounded-3xl sm:rounded-[2.5rem] border-2 border-amber-400 bg-white p-3.5 sm:p-6 md:p-7 shadow-2xl overflow-hidden">
            {/* Cabecera con badge y botón cerrar */}
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-800 border border-amber-300">
                <span>💰</span> DESAFÍO OFICIAL C7Dev_
              </div>

              <button
                id="btn-close-ad"
                onClick={() => {
                  setShowAdModal(false);
                  if (state === "idle") start();
                }}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 text-zinc-700 font-bold shadow-toy transition-transform active:scale-90 hover:bg-zinc-200 hover:text-black cursor-pointer text-sm"
                aria-label="Cerrar anuncio"
                title="Cerrar y jugar"
              >
                ✕
              </button>
            </div>

            {/* Contenido amplio y limpio con fondo blanco */}
            <div className="my-auto py-2 sm:py-3 text-center flex flex-col items-center">
              <div className="flex items-center justify-center gap-3 text-3xl sm:text-4xl animate-bounce">
                <span>💵</span>
                <span>🏆</span>
                <span>💸</span>
              </div>

              <h2 className="mt-1.5 sm:mt-2 font-display text-xl sm:text-3xl md:text-4xl text-amber-600 font-black leading-tight drop-shadow-xs">
                ¡GANA $10 USD POR CADA 1,000 PUNTOS!
              </h2>

              <p className="mt-1 max-w-2xl text-xs sm:text-sm text-zinc-700 font-semibold leading-relaxed">
                Supera los 10 niveles y acumula 1,000 puntos en una sola partida para ganar <strong>$10 dólares en efectivo</strong> transferidos al instante.
              </p>

              {/* 4 Cards limpias en tonos cálidos claros */}
              <div className="mt-3 sm:mt-4 grid w-full grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-left">
                <div className="rounded-xl bg-amber-50/80 p-2.5 sm:p-3 border border-amber-200/90 shadow-sm">
                  <span className="text-base sm:text-lg">⚡</span>
                  <p className="mt-0.5 font-bold text-amber-900 text-xs sm:text-sm">10 Niveles</p>
                  <p className="text-zinc-600 text-[11px] mt-0.5">Dificultad progresiva</p>
                </div>
                <div className="rounded-xl bg-amber-50/80 p-2.5 sm:p-3 border border-amber-200/90 shadow-sm">
                  <span className="text-base sm:text-lg">⏱️</span>
                  <p className="mt-0.5 font-bold text-amber-900 text-xs sm:text-sm">Contrarreloj</p>
                  <p className="text-zinc-600 text-[11px] mt-0.5">Reflejos y agilidad</p>
                </div>
                <div className="rounded-xl bg-amber-50/80 p-2.5 sm:p-3 border border-amber-200/90 shadow-sm">
                  <span className="text-base sm:text-lg">🎯</span>
                  <p className="mt-0.5 font-bold text-amber-900 text-xs sm:text-sm">Puntería Total</p>
                  <p className="text-zinc-600 text-[11px] mt-0.5">Caza insectos y combos</p>
                </div>
                <div className="rounded-xl bg-amber-50/80 p-2.5 sm:p-3 border border-amber-200/90 shadow-sm">
                  <span className="text-base sm:text-lg">💸</span>
                  <p className="mt-0.5 font-bold text-amber-900 text-xs sm:text-sm">Premio Seguro</p>
                  <p className="text-zinc-600 text-[11px] mt-0.5">¡Llega a 1,000 puntos!</p>
                </div>
              </div>

              <p className="mt-2 text-[10px] text-zinc-500 italic">
                * Promoción oficial para todos los jugadores. Reclama tu recompensa al alcanzar los 1,000 puntos.
              </p>
            </div>

            {/* Botón CTA ancho */}
            <div className="pt-2 border-t border-zinc-200">
              <button
                id="btn-accept-ad"
                onClick={() => {
                  setShowAdModal(false);
                  start();
                }}
                className="w-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 py-2.5 sm:py-3.5 px-6 font-display text-base sm:text-xl md:text-2xl text-zinc-950 font-black shadow-lg transition-all hover:scale-[1.01] hover:brightness-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                {adCountdown > 0 ? (
                  <>⏳ Comenzar Desafío ({adCountdown}s)...</>
                ) : (
                  <>🚀 ¡ACEPTAR DESAFÍO Y GANAR $10 USD!</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MENÚ PRINCIPAL O PANTALLA DE FIN DE PARTIDA AMPLIA Y SIN SCROLL ─── */}
      {state !== "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-2.5 sm:p-5 md:p-6 bg-black/40 backdrop-blur-md">
          <div className="w-[96%] sm:w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl max-h-[95dvh] rounded-3xl sm:rounded-[2.5rem] bg-card/95 p-3.5 sm:p-6 md:p-8 text-center shadow-toy border border-border flex flex-col justify-between overflow-hidden">
            
            {/* Header del menú */}
            <div>
              {/* Banner llamativo de la promo */}
              {state === "idle" && (
                <button
                  onClick={handleStartWithAd}
                  className="mb-2 sm:mb-3 w-full rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-400/25 to-amber-500/20 py-2 px-3 text-center border border-amber-400/60 shadow-toy transition-transform hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1">
                    💰 DESAFÍO $10 USD
                  </span>
                  <span className="font-display text-xs sm:text-sm text-foreground">
                    ¡Consigue 1,000 puntos y cobra! 🔥
                  </span>
                  <span className="text-xs text-amber-400 font-bold hidden sm:inline">Ver detalles ➔</span>
                </button>
              )}

              <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl text-primary">
                {state === "idle" ? "¡Atrapa Bichos!" : "¡Tiempo Agotado!"}
              </h1>

              {/* Texto limpio sin trucos ni spoilers */}
              {state === "idle" ? (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  Toca los insectos que corren por la pantalla, supera los 10 niveles y bate tu récord.
                </p>
              ) : score >= 900 ? (
                <div className="mt-2 rounded-2xl bg-amber-500/15 p-3 border-2 border-amber-400 text-left animate-enter">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl sm:text-3xl">😱💸</span>
                    <div>
                      <p className="font-display text-base sm:text-xl text-amber-400">
                        {score === 999
                          ? "¡¡999 PUNTOS!! A SOLO 1 PUNTO DE LOS $10 USD"
                          : `¡¡A ${1000 - score} PUNTOS DE LOS $10 USD!!`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Lograste {score}/1,000 puntos {score === 999 && "🏆 (PUNTUACIÓN MÁXIMA)"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-foreground leading-snug">
                    {score === 999
                      ? "¡Increíbles reflejos! Llegaste a 999 puntos, a solo 1 punto de los $10 USD... pero el cajero de C7Dev_ se quedó sin cambio 😂 ¡Comparte tu récord mundial!"
                      : "¡Estuviste muy cerca de los 1,000 puntos! Comparte tu récord y reta a tus amigos a ver si alguien puede superar tu marca."}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  Atrapaste {stats.caught} bichos y alcanzaste el Nivel {level} ({THEME_NAMES[theme]}).
                </p>
              )}

              {state === "over" && newBest && (
                <p className="mt-1 font-display text-lg sm:text-xl text-accent-foreground animate-bounce">
                  🎉 ¡Nuevo récord personal!
                </p>
              )}
            </div>

            {/* Bloque central: 2 columnas en Desktop / Tablet, 1 en Móvil */}
            <div className="my-2 sm:my-3 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 text-left">
              {state === "over" ? (
                <>
                  <div className="rounded-2xl bg-muted p-2.5 sm:p-3 flex items-center justify-around">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Puntos</p>
                      <p className="font-display text-xl sm:text-2xl text-foreground">{score}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Nivel</p>
                      <p className="font-display text-xl sm:text-2xl text-primary">{level}/10</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Precisión</p>
                      <p className="font-display text-xl sm:text-2xl text-foreground">{accuracy}%</p>
                    </div>
                  </div>

                  {/* Compartir en redes */}
                  <div className="rounded-2xl bg-muted/60 p-2.5 sm:p-3 border border-border flex flex-col justify-center">
                    <p className="text-xs font-bold text-foreground mb-1.5 text-center">📢 ¡Comparte tu récord!</p>
                    <div className="flex justify-center gap-1.5 sm:gap-2">
                      <button
                        onClick={shareOnFacebook}
                        className="flex-1 rounded-full bg-[#1877F2] py-2 px-2.5 text-xs font-extrabold text-white shadow-toy transition-transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110"
                        title="Compartir en Facebook"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        Facebook
                      </button>
                      <button
                        onClick={shareOnTikTok}
                        className="flex-1 rounded-full bg-black py-2 px-2.5 text-xs font-extrabold text-white shadow-toy transition-transform active:scale-95 flex items-center justify-center gap-1.5 border border-zinc-700 cursor-pointer hover:brightness-125"
                        title="Compartir en TikTok"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                        </svg>
                        TikTok
                      </button>
                      <button
                        onClick={copyShareLink}
                        className="rounded-full bg-primary/20 py-2 px-3 text-xs font-bold text-primary transition-transform active:scale-95 hover:bg-primary/30 cursor-pointer"
                        title="Copiar puntuación + texto + link"
                      >
                        📋 Copiar
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Columna izquierda: Misión diaria y récord */}
                  <div className="rounded-2xl bg-muted/70 p-3 flex flex-col justify-between border border-border/50">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-foreground">🎯 Misión diaria: 30 bichos</span>
                        <span className="text-muted-foreground">
                          {Math.min(missionCount, MISSION_TARGET)}/{MISSION_TARGET}
                          {missionDone && " ✅"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${missionProgress}%` }}
                        />
                      </div>
                    </div>
                    {best > 0 && (
                      <p className="mt-2 text-xs font-bold text-secondary-foreground">
                        🏆 Récord personal: <span className="text-primary font-display text-sm">{best} pts</span>
                      </p>
                    )}
                  </div>

                  {/* Columna derecha: Botones de navegación de récords y logros */}
                  <div className="rounded-2xl bg-muted/70 p-3 flex flex-col justify-center gap-2 border border-border/50">
                    <p className="text-xs font-bold text-foreground text-center">Clasificaciones y Logros</p>
                    <div className="flex gap-1.5 sm:gap-2">
                      <button
                        id="btn-open-local-board"
                        onClick={() => openBoard("local")}
                        className="flex-1 rounded-full border-2 border-border bg-background py-1.5 px-2 font-bold text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
                      >
                        🏅 Local
                      </button>
                      <button
                        id="btn-open-global-board"
                        onClick={() => openBoard("global")}
                        className="flex-1 rounded-full border-2 border-border bg-background py-1.5 px-2 font-bold text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
                      >
                        🌍 Global
                      </button>
                      <button
                        id="btn-open-achievements"
                        onClick={() => setShowAchievements(true)}
                        className="flex-1 rounded-full border-2 border-border bg-background py-1.5 px-2 font-bold text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
                      >
                        🏆 {unlocked.length}/{ACHIEVEMENTS.length}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Input para guardar en Top 10 si califica */}
            {state === "over" && qualifies && !boardSaved && (
              <div className="my-1.5 rounded-2xl bg-accent/60 p-2.5 flex items-center justify-between gap-2">
                <p className="font-bold text-xs text-foreground text-left">¡Entras al Top 10! Nombre (5 letras):</p>
                <div className="flex items-center gap-2">
                  <input
                    id="input-initials"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="ABCDE"
                    maxLength={5}
                    className="w-28 rounded-full border border-border bg-background px-3 py-1 text-center font-display text-base tracking-widest text-foreground uppercase outline-none focus:border-primary"
                  />
                  <button
                    id="btn-save-score"
                    onClick={saveToBoard}
                    className="rounded-full bg-primary px-4 py-1 font-display text-sm text-primary-foreground shadow-toy transition-transform active:scale-95"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {/* Botón Jugar grande y créditos */}
            <div>
              <button
                id="btn-play"
                onClick={start}
                className="w-full rounded-full bg-primary py-3 sm:py-3.5 px-8 font-display text-xl sm:text-2xl text-primary-foreground shadow-toy transition-transform active:scale-95 hover:brightness-110 cursor-pointer"
              >
                {state === "idle" ? "¡Jugar Ahora!" : "Intentar otra vez"}
              </button>

              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                Desarrollado con ❤️ por <span className="font-bold text-primary">C7Dev_</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Panel de récords */}
      {showBoard && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] bg-card p-6 shadow-toy border border-border">
            <div className="mb-4 flex overflow-hidden rounded-full border-2 border-border">
              <button
                id="tab-local"
                onClick={() => setBoardTab("local")}
                className={`flex-1 py-2 font-bold text-sm transition-colors ${boardTab === "local" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                🏅 Local
              </button>
              <button
                id="tab-global"
                onClick={() => {
                  setBoardTab("global");
                  globalBoard.fetch();
                }}
                className={`flex-1 py-2 font-bold text-sm transition-colors ${boardTab === "global" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                🌍 Global
              </button>
            </div>

            {boardTab === "local" ? (
              <>
                <h2 className="text-center font-display text-2xl sm:text-3xl text-primary">Top 10 Local</h2>
                <ol className="mt-4 flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {board.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground">Aún no hay récords. ¡Juega una partida!</p>
                  )}
                  {board.map((e, i) => (
                    <li key={i} className="flex items-center justify-between rounded-2xl bg-muted px-4 py-2">
                      <span className="font-bold text-foreground">{i + 1}. {e.name}</span>
                      <span className="font-display text-xl text-primary">{e.score}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <h2 className="text-center font-display text-2xl sm:text-3xl text-primary">Top 10 Mundial 🌍</h2>
                {globalBoard.loading && (
                  <p className="mt-4 text-center text-muted-foreground animate-pulse">Cargando...</p>
                )}
                {!globalBoard.loading && !globalBoard.available && (
                  <div className="mt-4 rounded-2xl bg-muted p-4 text-center text-sm text-muted-foreground">
                    <p>🔌 Leaderboard global no disponible en local.</p>
                    <p className="mt-1 opacity-70">Se activará tras el deploy en Vercel con Postgres.</p>
                  </div>
                )}
                {!globalBoard.loading && globalBoard.available && (
                  <ol className="mt-4 flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {globalBoard.rows.length === 0 && (
                      <p className="text-center text-muted-foreground">¡Sé el primero en el ranking mundial!</p>
                    )}
                    {globalBoard.rows.map((e, i) => (
                      <li key={i} className="flex items-center justify-between rounded-2xl bg-muted px-4 py-2">
                        <span className="font-bold text-foreground">
                          {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `${e.rank}.`} {e.name}
                        </span>
                        <span className="font-display text-xl text-primary">{e.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            <button
              id="btn-close-board"
              onClick={() => setShowBoard(false)}
              className="mt-4 w-full rounded-full bg-primary px-6 py-3 font-display text-xl text-primary-foreground shadow-toy transition-transform active:scale-95 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Panel de logros */}
      {showAchievements && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-[2rem] bg-card p-6 shadow-toy border border-border">
            <h2 className="text-center font-display text-2xl sm:text-3xl text-primary">
              🏆 Logros {unlocked.length}/{ACHIEVEMENTS.length}
            </h2>
            <ul className="mt-4 flex flex-col gap-2">
              {ACHIEVEMENTS.map((a) => {
                const got = unlocked.includes(a.id);
                return (
                  <li
                    key={a.id}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-2 ${got ? "bg-accent/60" : "bg-muted opacity-60"}`}
                  >
                    <span className="text-2xl">{got ? a.icon : "🔒"}</span>
                    <div>
                      <p className="font-bold text-foreground text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              id="btn-close-achievements"
              onClick={() => setShowAchievements(false)}
              className="mt-4 w-full rounded-full bg-primary px-6 py-3 font-display text-xl text-primary-foreground shadow-toy transition-transform active:scale-95 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
