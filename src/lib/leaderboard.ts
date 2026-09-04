import { createServerFn } from "@tanstack/react-start";

export type ScoreEntry = { rank: number; name: string; score: number };

let dbReady = false;

async function ensureDb() {
  if (!dbReady) {
    const { initDb } = await import("@/lib/db");
    await initDb();
    dbReady = true;
  }
}

/** Server function: returns top-10 global scores */
export const fetchGlobalScores = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureDb();
    const { getTopScores } = await import("@/lib/db");
    const rows = await getTopScores();
    return { ok: true as const, scores: rows };
  } catch (err) {
    console.error("[leaderboard fetchGlobalScores]", err);
    return { ok: false as const, scores: [] };
  }
});

/** Server function: upserts a score for this device UUID */
export const submitScore = createServerFn({ method: "POST" })
  .validator((data: { uuid: string; name: string; score: number }) => data)
  .handler(async ({ data }) => {
    const { uuid, name, score } = data;

    if (
      typeof uuid !== "string" ||
      typeof name !== "string" ||
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 99999
    ) {
      return { ok: false as const, error: "invalid payload" };
    }

    try {
      await ensureDb();
      const { upsertScore } = await import("@/lib/db");
      await upsertScore(
        uuid.slice(0, 64),
        name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3) || "???",
        Math.round(score),
      );
      return { ok: true as const };
    } catch (err) {
      console.error("[leaderboard submitScore]", err);
      return { ok: false as const, error: "server error" };
    }
  });
