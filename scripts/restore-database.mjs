#!/usr/bin/env node
// Restores a backup produced by scripts/backup-database.mjs. Deliberately
// requires --yes to actually write — running it bare just previews what
// would happen, since this can overwrite live data.
//
// Usage:
//   node scripts/restore-database.mjs backups/backup-2026-07-10T12-00-00-000Z.json.gz
//   node scripts/restore-database.mjs backups/backup-....json.gz --yes
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--yes");

if (!filePath) {
  console.error("Usage: node scripts/restore-database.mjs <backup-file.json.gz> [--yes]");
  process.exit(1);
}
if (!DB_HOST || !DB_DATABASE || !DB_USERNAME) {
  console.error("[restore] DB_HOST / DB_DATABASE / DB_USERNAME are not set.");
  process.exit(1);
}

async function main() {
  const raw = fs.readFileSync(path.resolve(filePath));
  const json = filePath.endsWith(".gz") ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const dump = JSON.parse(json);
  const tableNames = Object.keys(dump.tables);
  const totalRows = tableNames.reduce((s, t) => s + dump.tables[t].length, 0);

  console.log(`[restore] Backup dumped at ${dump.dumpedAt} from database "${dump.database}"`);
  console.log(`[restore] Contains ${tableNames.length} table(s), ${totalRows} total row(s).`);
  console.log(`[restore] Target: ${DB_HOST}/${DB_DATABASE}`);

  if (!confirmed) {
    console.log("\n[restore] DRY RUN — no changes made. Re-run with --yes to actually restore.");
    console.log("[restore] This upserts every row from the backup (ON DUPLICATE KEY UPDATE) — it does not delete rows created after the backup was taken.");
    return;
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT) || 3306,
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
  });

  try {
    for (const table of tableNames) {
      const rows = dump.tables[table];
      if (rows.length === 0) continue;
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`${table}\` (
          id VARCHAR(255) PRIMARY KEY,
          data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
          uid VARCHAR(255),
          createdAt VARCHAR(255),
          updatedAt VARCHAR(255)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      let restored = 0;
      for (const row of rows) {
        await conn.query(
          `INSERT INTO \`${table}\` (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE data=VALUES(data), uid=VALUES(uid), updatedAt=VALUES(updatedAt)`,
          [row.id, row.data, row.uid, row.createdAt, row.updatedAt]
        );
        restored++;
      }
      console.log(`  - ${table}: restored ${restored} row(s)`);
    }
    console.log("[restore] Done.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[restore] FAILED:", err.message);
  process.exit(1);
});
