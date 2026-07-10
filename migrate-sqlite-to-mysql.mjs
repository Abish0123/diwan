import mysql from "mysql2/promise";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = mysql.createPool({
  host: "217.21.85.14",
  port: 3306,
  database: "nobl6990_Demo1-SD",
  user: "nobl6990_Demo-SD",
  password: "Q0N#k]q)s0A~aQOM",
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 15000,
});

const sqlite = new Database(path.join(__dirname, "local_database.db"), { readonly: true });

async function ensureTable(tableName) {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS \`${tableName}\` (id VARCHAR(255) PRIMARY KEY, data LONGTEXT, uid VARCHAR(255), createdAt VARCHAR(255), updatedAt VARCHAR(255))`
  );
}

async function run() {
  // Get all tables from SQLite that have data
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);

  console.log(`Found ${tables.length} tables in SQLite\n`);

  let grandTotal = 0;

  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) continue;

    await ensureTable(table);

    let count = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        // SQLite rows: { id, data, uid, createdAt, updatedAt }
        const id = row.id || String(Math.random());
        const data = row.data || "{}";
        const uid = row.uid || "admin-uid";
        const createdAt = row.createdAt || new Date().toISOString();
        const updatedAt = row.updatedAt || createdAt;

        await pool.execute(
          `INSERT INTO \`${table}\` (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), uid=VALUES(uid), updatedAt=VALUES(updatedAt)`,
          [String(id), String(data), String(uid), String(createdAt), String(updatedAt)]
        );
        count++;
      } catch (e) {
        skipped++;
        // silent skip for individual row errors
      }
    }

    console.log(`  ${table}: ${count} rows migrated${skipped ? ` (${skipped} skipped)` : ""}`);
    grandTotal += count;
  }

  console.log(`\n✅ Migration complete: ${grandTotal} rows written to cPanel MySQL`);
  sqlite.close();
  await pool.end();
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
