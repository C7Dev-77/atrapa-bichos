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
  if (_client !== "pending" && _client !== null) return _client;

  // In local development, read .env.local if present
  if (typeof process !== "undefined" && process.cwd) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const match = line.match(/^\s*([\w]+)\s*=\s*["']?(.*?)["']?\s*$/);
          if (match && match[1] && match[2] && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
          }
        }
      }
    } catch {
      // Ignored in serverless/browser
    }
  }

  const conn =
    process.env["POSTGRES_URL"] ||
    process.env["DATABASE_URL"] ||
    process.env["NEON_URL"] ||
    process.env["DB_URL"] ||
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
      name        VARCHAR(10) NOT NULL,
      score       INTEGER     NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Safely ensure column supports 5+ chars if already created with CHAR(3)
  try {
    await db.sql`ALTER TABLE scores ALTER COLUMN name TYPE VARCHAR(10)`;
  } catch {
    // Column already compatible
  }

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

  const cleanName = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5) || "CRIST";

  await db.sql`
    INSERT INTO scores (uuid, name, score)
    VALUES (${uuid}, ${cleanName}, ${score})
    ON CONFLICT (uuid)
    DO UPDATE SET
      name  = EXCLUDED.name,
      score = EXCLUDED.score
    WHERE EXCLUDED.score >= scores.score
  `;
}

/** Returns true when a Postgres connection is configured. */
export async function isDbAvailable(): Promise<boolean> {
  return (await getClient()) !== null;
}
