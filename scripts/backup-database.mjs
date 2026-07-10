#!/usr/bin/env node
// Real, working MySQL backup — previously there was no backup mechanism of
// any kind (no script, no cron, no docs). Dumps every real data table
// (server.ts's generic entity tables all share the same id/data/uid/
// createdAt/updatedAt shape) to a single timestamped JSON file, so this
// works on any host that can run `node` — it doesn't shell out to the
// `mysqldump` binary, which shared cPanel hosting doesn't always expose.
//
// Usage:
//   node scripts/backup-database.mjs                 # backup to ./backups/
//   BACKUP_DIR=/path/to/backups node scripts/backup-database.mjs
//   BACKUP_KEEP_DAYS=30 node scripts/backup-database.mjs   # prune older backups
//
// Requires the same DB_HOST / DB_PORT / DB_DATABASE / DB_USERNAME /
// DB_PASSWORD env vars server.ts already uses (reads the same .env).
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;

if (!DB_HOST || !DB_DATABASE || !DB_USERNAME) {
  console.error("[backup] DB_HOST / DB_DATABASE / DB_USERNAME are not set — nothing to back up (this deployment isn't using MySQL).");
  process.exit(1);
}

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 14;

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT) || 3306,
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
  });

  try {
    const [tableRows] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [DB_DATABASE]
    );
    const tables = tableRows.map((r) => r.TABLE_NAME).sort();

    console.log(`[backup] Dumping ${tables.length} table(s) from ${DB_HOST}/${DB_DATABASE}...`);

    const dump = { database: DB_DATABASE, dumpedAt: new Date().toISOString(), tables: {} };
    let totalRows = 0;
    for (const table of tables) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      dump.tables[table] = rows;
      totalRows += rows.length;
      console.log(`  - ${table}: ${rows.length} row(s)`);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outFile = path.join(BACKUP_DIR, `backup-${stamp}.json.gz`);
    const json = JSON.stringify(dump);
    fs.writeFileSync(outFile, zlib.gzipSync(json));

    const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
    console.log(`[backup] Wrote ${outFile} (${sizeMb} MB, ${totalRows} total rows across ${tables.length} tables)`);

    pruneOldBackups();
  } finally {
    await conn.end();
  }
}

function pruneOldBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-") && f.endsWith(".json.gz"));
  let removed = 0;
  for (const f of files) {
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  if (removed > 0) console.log(`[backup] Pruned ${removed} backup(s) older than ${KEEP_DAYS} days.`);
}

main().catch((err) => {
  console.error("[backup] FAILED:", err.message);
  process.exit(1);
});
