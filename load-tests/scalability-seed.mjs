/**
 * scalability-seed.mjs
 *
 * Direct SQLite seeder for scalability tests.
 * Writes rows straight to the SQLite file using better-sqlite3 — bypasses
 * the HTTP rate-limiter entirely. 10k rows seed in ~150ms.
 *
 * The server must NOT be running against the same DB file when this runs,
 * because SQLite WAL allows concurrent readers but only one writer at a time.
 * scalability-test.mjs starts a dedicated server process on a temp DB that
 * this module populates before launching autocannon.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";

/**
 * Create or open a SQLite DB at `dbPath`, wipe and recreate `tableName`,
 * then bulk-insert `count` rows using a prepared statement in a transaction.
 *
 * @param {string} dbPath   — absolute path to the .db file
 * @param {string} table    — table name (e.g. "students")
 * @param {number} count    — number of rows to insert
 * @param {object} opts     — { payloadKb?: number } — pad each row's JSON to ~payloadKb KB
 * @returns {{ rowCount: number, durationMs: number }}
 */
export function seedTable(dbPath, table, count, opts = {}) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Create a standard entity table matching the server schema
  db.prepare(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      id        TEXT PRIMARY KEY,
      data      TEXT,
      uid       TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `).run();

  // Clear existing rows for a clean benchmark
  db.prepare(`DELETE FROM "${table}"`).run();

  const insert = db.prepare(
    `INSERT INTO "${table}" (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`
  );

  const uid  = "scalability-test-user";
  const now  = new Date().toISOString();
  const padding = opts.payloadKb
    ? "x".repeat(Math.max(0, opts.payloadKb * 1024 - 200))
    : "";

  const start = performance.now();
  const bulkInsert = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const data = JSON.stringify({
        name: `Scale Record ${i}`,
        email: `scale_${i}@test.example`,
        grade: `Grade ${(i % 12) + 1}`,
        status: ["active", "inactive", "pending"][i % 3],
        score: i % 100,
        tags: [`tag_${i % 10}`, `batch_${Math.floor(i / 100)}`],
        seqIndex: i,
        padding,
      });
      insert.run(id, data, uid, now, now);
    }
  });

  bulkInsert();
  db.close();

  return { rowCount: count, durationMs: performance.now() - start };
}

/**
 * Write a minimal server-compatible SQLite DB to `dbPath` with a pre-seeded
 * "users" table containing the admin test account, so the server can boot and
 * authenticate requests immediately.
 *
 * The server creates its own tables on first boot, but we must ensure the
 * "users" table exists so /api/session/login works without a full warm-up.
 */
export function seedAdminUser(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.prepare(`
    CREATE TABLE IF NOT EXISTS "users" (
      id        TEXT PRIMARY KEY,
      data      TEXT,
      uid       TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `).run();

  // Check if the admin user already exists
  const existing = db.prepare(`SELECT id FROM "users" WHERE id = 'admin-scalability'`).get();
  if (!existing) {
    // bcrypt hash for "admin123" (same hash used by the server seed)
    const hash = "$2b$10$YourHashHere"; // placeholder — server uses its own auth
    const now  = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO "users" (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`)
      .run(
        "admin-scalability",
        JSON.stringify({
          email: "admin@eduerp.com",
          password: hash,
          role: "admin",
          name: "Admin",
        }),
        "admin-scalability",
        now, now
      );
  }

  db.close();
}
