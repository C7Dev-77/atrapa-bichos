import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AntGame,
  GAME_SECONDS,
  type GameState,
  type GameStats,
  type Theme,
} from "@/components/AntGame";
import { ensureAudio, isMuted, setMuted, sfx, startMusic, stopMusic } from "@/lib/sound";
import { fetchGlobalScores, submitScore } from "@/server/leaderboard";
import { getOrCreateUuid } from "@/lib/uuid";
import type { ScoreEntry } from "@/server/leaderboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atrapa Bichos — Juego para niños" },
      {
        name: "description",
        content:
          "Juego web gratis para niños: toca los bichitos que corren por la pantalla, sube de nivel, atrapa al jefe, desbloquea logros y bate tu récord.",
      },
      { property: "og:title", content: "Atrapa Bichos — Juego para niños" },
      {
        property: "og:description",
        content:
          "Toca los bichitos, sube de nivel, atrapa al jefe, consigue logros y bate tu récord. Divertido y sin sustos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EMPTY_STATS: GameStats = { caught: 0, missed: 0, maxCombo: 0, bosses: 0, gold: 0 };

// 5 themes — one per level group
const THEMES: Theme[] = ["prado", "playa", "noche", "artico", "volcan"];

const THEME_ICONS: Record<Theme, string> = {
  prado: "🌿",
  playa: "🏖️",
  noche: "🌙",
  artico: "❄️",
  volcan: "🌋",
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
  { id: "score100", icon: "💯", name: "Cien puntos", desc: "Consigue 100 puntos en una partida", test: ({ score }) => score >= 100 },
  { id: "score300", icon: "🌟", name: "Trescientos puntos", desc: "Consigue 300 puntos en una partida", test: ({ score }) => score >= 300 },
  { id: "gold", icon: "✨", name: "Bicho dorado", desc: "Atrapa un bicho dorado", test: ({ stats }) => stats.gold >= 1 },
  { id: "boss", icon: "👑", name: "Cazador de jefes", desc: "Atrapa a un bicho jefe", test: ({ stats }) => stats.bosses >= 1 },
  { id: "sharp", icon: "🎯", name: "Puntería experta", desc: "90% de precisión con 10+ toques", test: ({ stats, accuracy }) => accuracy >= 90 && stats.caught + stats.missed >= 10 },
  { id: "level5", icon: "🚀", name: "Nivel 5", desc: "Llega al nivel 5", test: ({ level }) => level >= 5 },
  { id: "butterfly", icon: "🦋", name: "Mariposa atrapada", desc: "Atrapa una mariposa (¡es muy rápida!)", test: ({ stats }) => (stats as GameStats & { butterflies?: number }).butterflies != null && (stats as GameStats & { butterflies?: number }).butterflies! >= 1 },
  { id: "beetle", icon: "🪲", name: "Escarabajo raro", desc: "Atrapa un escarabajo (aparece poco)", test: ({ stats }) => (stats as GameStats & { beetles?: number }).beetles != null && (stats as GameStats & { beetles?: number }).beetles! >= 1 },
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
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

  const level = state === "playing" ? Math.min(9, Math.floor((GAME_SECONDS - timeLeft) / 15) + 1) : 1;
  const theme: Theme = THEMES[(level - 1) % THEMES.length] ?? "prado";
  const prevLevelRef = useRef(level);

  const pushToast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // carga inicial de localStorage
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
  }, []);

  // aviso de nivel
  useEffect(() => {
    if (state === "playing" && level > prevLevelRef.current) {
      pushToast(`🚀 ¡Nivel ${level}! ${THEME_ICONS[theme]}`);
      sfx.levelUp();
    }
    prevLevelRef.current = level;
  }, [level, state, pushToast, theme]);

  // logros de combo en vivo
  useEffect(() => {
    if (state !== "playing" || combo < 5) return;
    const hit = ACHIEVEMENTS.filter(
      (a) => (a.id === "combo5" || a.id === "combo10") && !unlocked.includes(a.id) && a.test({ stats: liveStats, score, accuracy: 0, combo, level }),
    );
    if (hit.length) {
      const next = [...unlocked, ...hit.map((a) => a.id)];
      setUnlocked(next);
      localStorage.setItem("ab-ach", JSON.stringify(next));
      hit.forEach((a) => pushToast(`🏆 ¡Logro: ${a.name}!`));
      sfx.achievement();
    }
  }, [combo, state, unlocked, liveStats, score, level, pushToast]);

  // fin de partida
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

    // misión diaria
    const newCount = missionCount + stats.caught;
    setMissionCount(newCount);
    localStorage.setItem(missionKey(), String(newCount));
    if (!missionDone && newCount >= MISSION_TARGET) {
      setMissionDone(true);
      pushToast("🎯 ¡Misión diaria completada!");
      sfx.achievement();
      setConfetti(true);
    }

    // logros
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
    setTimeLeft(GAME_SECONDS);
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

  const onScore = useCallback((n: number) => setScore((s) => Math.max(0, s + n)), []);
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

  const qualifies =
    score > 0 && (board.length < 10 || score > (board[board.length - 1]?.score ?? 0));

  const saveToBoard = async () => {
    const name = (nameInput.trim() || "???").toUpperCase().slice(0, 3);
    const next = [...board, { name, score }].sort((a, b) => b.score - a.score).slice(0, 10);
    setBoard(next);
    localStorage.setItem("ab-board", JSON.stringify(next));
    setBoardSaved(true);
    // also send to global leaderboard (fire and forget)
    await postScore(name, score);
  };

  const openBoard = (tab: "local" | "global") => {
    setBoardTab(tab);
    setShowBoard(true);
    if (tab === "global") globalBoard.fetch();
  };

  const missionProgress = Math.min(100, Math.round((missionCount / MISSION_TARGET) * 100));

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-meadow select-none">
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

      {confetti && state === "over" && <Confetti />}

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <div className="rounded-3xl bg-card/90 px-5 py-3 shadow-toy">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Puntos</p>
            <p className="font-display text-4xl leading-none text-primary">{score}</p>
          </div>
          {state === "playing" && (
            <div className="rounded-full bg-card/90 px-4 py-1.5 text-center shadow-toy">
              <p className="text-sm font-bold text-foreground">
                Nivel {level} {THEME_ICONS[theme]}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              id="btn-mute"
              onClick={toggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="pointer-events-auto rounded-full bg-card/90 px-4 py-2 font-bold text-foreground shadow-toy transition-transform active:scale-95 hover:bg-card"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {state === "playing" && (
              <button
                id="btn-pause"
                onClick={() => setPaused((p) => !p)}
                className="pointer-events-auto rounded-full bg-card/90 px-4 py-2 font-bold text-foreground shadow-toy transition-transform active:scale-95 hover:bg-card"
              >
                {paused ? "▶ Continuar" : "⏸ Pausa"}
              </button>
            )}
          </div>
          <div className="rounded-3xl bg-card/90 px-5 py-3 text-right shadow-toy">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tiempo</p>
            <p className="font-display text-4xl leading-none text-accent-foreground">{timeLeft}s</p>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none absolute top-28 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-full bg-primary px-5 py-2 shadow-toy animate-enter">
            <p className="font-display text-lg text-primary-foreground">{t.text}</p>
          </div>
        ))}
      </div>

      {/* Combo banner */}
      {state === "playing" && combo > 1 && (
        <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 rounded-full bg-primary px-5 py-2 shadow-toy animate-bounce">
          <p className="font-display text-xl text-primary-foreground">Combo x{combo}</p>
        </div>
      )}

      {/* Pause overlay */}
      {state === "playing" && paused && (
        <div className="absolute inset-0 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] bg-card p-8 text-center shadow-toy">
            <p className="font-display text-5xl text-primary">Pausa</p>
            <p className="mt-2 text-lg text-muted-foreground">Toma un respiro</p>
            <button
              id="btn-resume"
              onClick={() => setPaused(false)}
              className="mt-6 w-full rounded-full bg-primary px-8 py-4 font-display text-2xl text-primary-foreground shadow-toy transition-transform active:scale-95 hover:brightness-110"
            >
              ▶ Continuar
            </button>
            <button
              id="btn-exit-pause"
              onClick={() => setState("idle")}
              className="mt-3 w-full rounded-full border-2 border-border bg-background px-8 py-3 font-display text-xl text-foreground transition-colors hover:bg-accent"
            >
              Salir al menú
            </button>
          </div>
        </div>
      )}

      {/* Menú / fin de partida */}
      {state !== "playing" && (
        <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-card p-8 text-center shadow-toy">
            <h1 className="font-display text-4xl text-primary sm:text-5xl">
              {state === "idle" ? "¡Atrapa Bichos!" : "¡Se acabó el tiempo!"}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {state === "idle"
                ? "Toca los bichitos, sube de nivel y atrapa al jefe. ¡Cuidado con las bombas! 💣"
                : `Atrapaste ${stats.caught} bichito${stats.caught === 1 ? "" : "s"} y llegaste al nivel ${level}.`}
            </p>

            {state === "over" && newBest && (
              <p className="mt-3 font-display text-2xl text-accent-foreground animate-bounce">
                🎉 ¡Nuevo récord!
              </p>
            )}

            {state === "over" && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Puntos</p>
                  <p className="font-display text-2xl text-foreground">{score}</p>
                </div>
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Combo máx.</p>
                  <p className="font-display text-2xl text-foreground">x{stats.maxCombo}</p>
                </div>
                <div className="rounded-2xl bg-muted p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Precisión</p>
                  <p className="font-display text-2xl text-foreground">{accuracy}%</p>
                </div>
              </div>
            )}

            {/* guardar en tabla de récords */}
            {state === "over" && qualifies && !boardSaved && (
              <div className="mt-4 rounded-2xl bg-accent/60 p-4">
                <p className="font-bold text-foreground">¡Entras en el Top 10! Escribe tus iniciales:</p>
                <div className="mt-2 flex justify-center gap-2">
                  <input
                    id="input-initials"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="ABC"
                    maxLength={3}
                    className="w-24 rounded-full border-2 border-border bg-background px-4 py-2 text-center font-display text-xl tracking-widest text-foreground uppercase outline-none focus:border-primary"
                  />
                  <button
                    id="btn-save-score"
                    onClick={saveToBoard}
                    className="rounded-full bg-primary px-5 py-2 font-display text-lg text-primary-foreground shadow-toy transition-transform active:scale-95"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {/* misión diaria */}
            <div className="mt-4 rounded-2xl bg-muted p-3 text-left">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">
                  🎯 Misión diaria: atrapa {MISSION_TARGET} bichos
                </p>
                <p className="text-sm font-bold text-muted-foreground">
                  {Math.min(missionCount, MISSION_TARGET)}/{MISSION_TARGET}
                  {missionDone && " ✅"}
                </p>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${missionProgress}%` }}
                />
              </div>
            </div>

            {best > 0 && (
              <p className="mt-3 text-base font-bold text-secondary-foreground">Récord local: {best}</p>
            )}

            {state === "idle" && (
              <>
                {/* leyenda de bichos */}
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full bg-muted px-3 py-1">⏰ +10s</span>
                  <span className="rounded-full bg-muted px-3 py-1">❄️ Congela</span>
                  <span className="rounded-full bg-muted px-3 py-1">⚡ x2 pts</span>
                  <span className="rounded-full bg-muted px-3 py-1">✨ Dorado +10</span>
                  <span className="rounded-full bg-muted px-3 py-1">💣 -5</span>
                  <span className="rounded-full bg-muted px-3 py-1">👑 Jefe +25</span>
                  <span className="rounded-full bg-muted px-3 py-1">🦋 +4</span>
                  <span className="rounded-full bg-muted px-3 py-1">🕷 +6</span>
                  <span className="rounded-full bg-muted px-3 py-1">🐝 +3</span>
                  <span className="rounded-full bg-muted px-3 py-1">🪲 +8</span>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    id="btn-open-local-board"
                    onClick={() => openBoard("local")}
                    className="rounded-full border-2 border-border bg-background px-4 py-2 font-bold text-foreground transition-colors hover:bg-accent"
                  >
                    🏅 Local
                  </button>
                  <button
                    id="btn-open-global-board"
                    onClick={() => openBoard("global")}
                    className="rounded-full border-2 border-border bg-background px-4 py-2 font-bold text-foreground transition-colors hover:bg-accent"
                  >
                    🌍 Global
                  </button>
                  <button
                    id="btn-open-achievements"
                    onClick={() => setShowAchievements(true)}
                    className="rounded-full border-2 border-border bg-background px-4 py-2 font-bold text-foreground transition-colors hover:bg-accent"
                  >
                    🏆 Logros {unlocked.length}/{ACHIEVEMENTS.length}
                  </button>
                </div>
              </>
            )}

            <button
              id="btn-play"
              onClick={start}
              className="mt-6 w-full rounded-full bg-primary px-8 py-4 font-display text-2xl text-primary-foreground shadow-toy transition-transform active:scale-95 hover:brightness-110"
            >
              {state === "idle" ? "Jugar" : "Jugar otra vez"}
            </button>
          </div>
        </div>
      )}

      {/* Panel de récords (Local / Global) */}
      {showBoard && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] bg-card p-6 shadow-toy">
            {/* tabs */}
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
                  if (globalBoard.rows.length === 0) globalBoard.fetch();
                }}
                className={`flex-1 py-2 font-bold text-sm transition-colors ${boardTab === "global" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                🌍 Global
              </button>
            </div>

            {boardTab === "local" ? (
              <>
                <h2 className="text-center font-display text-3xl text-primary">Top 10 Local</h2>
                <ol className="mt-4 flex flex-col gap-2">
                  {board.length === 0 && (
                    <p className="text-center text-muted-foreground">Aún no hay récords. ¡Juega una partida!</p>
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
                <h2 className="text-center font-display text-3xl text-primary">Top 10 Mundial 🌍</h2>
                {globalBoard.loading && (
                  <p className="mt-4 text-center text-muted-foreground animate-pulse">Cargando...</p>
                )}
                {!globalBoard.loading && !globalBoard.available && (
                  <div className="mt-4 rounded-2xl bg-muted p-4 text-center text-sm text-muted-foreground">
                    <p>🔌 Leaderboard global no disponible en modo local.</p>
                    <p className="mt-1 opacity-70">Estará activo tras desplegar en Vercel.</p>
                  </div>
                )}
                {!globalBoard.loading && globalBoard.available && (
                  <ol className="mt-4 flex flex-col gap-2">
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
              className="mt-4 w-full rounded-full bg-primary px-6 py-3 font-display text-xl text-primary-foreground shadow-toy transition-transform active:scale-95"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Panel de logros */}
      {showAchievements && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-foreground/40 p-6 backdrop-blur-md">
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-[2rem] bg-card p-6 shadow-toy">
            <h2 className="text-center font-display text-3xl text-primary">
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
                      <p className="font-bold text-foreground">{a.name}</p>
                      <p className="text-sm text-muted-foreground">{a.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              id="btn-close-achievements"
              onClick={() => setShowAchievements(false)}
              className="mt-4 w-full rounded-full bg-primary px-6 py-3 font-display text-xl text-primary-foreground shadow-toy transition-transform active:scale-95"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
