/**
 * PostgreSQL client using `pg` (node-postgres) with graceful fallback.
 *
 * Works with ANY env var name for the connection string, including Neon's
 * default `DATABASE_URL`, Vercel's `POSTGRES_URL`, or a custom `NEON_URL`.
 *
 * When no connection string is found every exported function returns null/empty
 * so the game works normally — the global leaderboard shows "not available".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Pool as PgPool } from "pg";

let _pool: PgPool | null | "pending" = "pending";

/** Returns a connected Pool or null if no DB is configured. */
async function getPool(): Promise<PgPool | null> {
  if (_pool !== "pending") return _pool;

  // Resolve connection string from any common env var name
  const conn =
    process.env["POSTGRES_URL"] ||
    process.env["DATABASE_URL"] ||
    process.env["NEON_URL"] ||
    process.env["DB_URL"] ||
    process.env["POSTGRES_URL_NON_POOLING"] ||
    process.env["STORAGE_URL"];

  if (!conn) {
    console.warn("[db] No DB connection string found — leaderboard disabled.");
    _pool = null;
    return null;
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false }, // required for Neon
      max: 5,
      idleTimeoutMillis: 30000,
    });
    _pool = pool;
    return _pool;
  } catch (err) {
    console.error("[db] Failed to create pg pool:", err);
    _pool = null;
    return null;
  }
}

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
};

/** Creates the scores table and unique index if they don't exist. */
export async function initDb(): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id          SERIAL PRIMARY KEY,
        uuid        TEXT        NOT NULL,
        name        VARCHAR(10) NOT NULL,
        score       INTEGER     NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Safely upgrade column if it was created as CHAR(3)
    try {
      await client.query(
        `ALTER TABLE scores ALTER COLUMN name TYPE VARCHAR(10)`,
      );
    } catch {
      // Already compatible — ignore
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS scores_uuid_idx ON scores (uuid)
    `);
  } finally {
    client.release();
  }
}

/** Returns top-10 global scores ordered by score desc. */
export async function getTopScores(): Promise<ScoreRow[]> {
  const pool = await getPool();
  if (!pool) return [];

  const client = await pool.connect();
  try {
    const { rows } = await client.query<ScoreRow>(`
      SELECT
        RANK() OVER (ORDER BY score DESC) AS rank,
        name,
        score
      FROM scores
      ORDER BY score DESC
      LIMIT 10
    `);
    return rows;
  } finally {
    client.release();
  }
}

/** Upserts a score for a UUID — only updates when the new score is higher. */
export async function upsertScore(
  uuid: string,
  name: string,
  score: number,
): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  const cleanName =
    name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5) || "ANON";

  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO scores (uuid, name, score)
      VALUES ($1, $2, $3)
      ON CONFLICT (uuid)
      DO UPDATE SET
        name  = EXCLUDED.name,
        score = EXCLUDED.score
      WHERE EXCLUDED.score >= scores.score
    `,
      [uuid, cleanName, score],
    );
  } finally {
    client.release();
  }
}

/** Returns true when a Postgres connection is configured. */
export async function isDbAvailable(): Promise<boolean> {
  return (await getPool()) !== null;
}
