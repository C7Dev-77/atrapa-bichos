/**
 * Vercel Postgres client with graceful fallback.
 *
 * When POSTGRES_URL is not set (local dev without DB) every exported
 * function returns null/empty so the game works normally — the global
 * leaderboard simply shows a "not available" message.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// We import lazily to avoid crashing at module-load time in environments
// where @vercel/postgres is not installed or POSTGRES_URL is missing.
type SqlClient = {
  sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<{ rows: any[] }>;
};

let _client: SqlClient | null | "pending" = "pending";

async function getClient(): Promise<SqlClient | null> {
  if (_client !== "pending") return _client;

  const conn =
    process.env["POSTGRES_URL"] ||
    process.env["DATABASE_URL"] ||
    process.env["STORAGE_URL"] ||
    process.env["POSTGRES_URL_NON_POOLING"];

  if (!conn) {
    _client = null;
    return null;
  }

  // Ensure @vercel/postgres finds the URL even if named differently by Vercel prefix
  if (!process.env["POSTGRES_URL"]) {
    process.env["POSTGRES_URL"] = conn;
  }

  try {
    const mod = await import("@vercel/postgres");
    _client = mod as unknown as SqlClient;
    return _client;
  } catch {
    console.warn("[db] @vercel/postgres not available — leaderboard disabled");
    _client = null;
    return null;
  }
}

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
};

/** Creates the scores table if it doesn't exist. Call once at startup. */
export async function initDb(): Promise<void> {
  const db = await getClient();
  if (!db) return;

  await db.sql`
    CREATE TABLE IF NOT EXISTS scores (
      id          SERIAL PRIMARY KEY,
      uuid        TEXT        NOT NULL,
      name        CHAR(3)     NOT NULL,
      score       INTEGER     NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db.sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scores_uuid_idx ON scores (uuid)
  `;
}

/** Returns top-10 global scores ordered by score desc. */
export async function getTopScores(): Promise<ScoreRow[]> {
  const db = await getClient();
  if (!db) return [];

  const { rows } = await db.sql`
    SELECT
      RANK() OVER (ORDER BY score DESC) AS rank,
      name,
      score
    FROM scores
    ORDER BY score DESC
    LIMIT 10
  `;

  return rows as ScoreRow[];
}

/** Upserts a score for a UUID — only updates if the new score is higher. */
export async function upsertScore(uuid: string, name: string, score: number): Promise<void> {
  const db = await getClient();
  if (!db) return;

  await db.sql`
    INSERT INTO scores (uuid, name, score)
    VALUES (${uuid}, ${name.toUpperCase().slice(0, 3)}, ${score})
    ON CONFLICT (uuid)
    DO UPDATE SET
      name  = EXCLUDED.name,
      score = EXCLUDED.score
    WHERE EXCLUDED.score > scores.score
  `;
}

/** Returns true when a Postgres connection is configured. */
export async function isDbAvailable(): Promise<boolean> {
  return (await getClient()) !== null;
}
