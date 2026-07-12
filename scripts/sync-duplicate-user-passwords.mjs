// One-time backfill: fix `users` rows that already drifted out of sync
// before the duplicate-row password-sync fix existed. For each email with
// >1 `users` row and mismatched passwords, copies the password from the row
// login actually authenticates against (id === email, since that's login's
// first, always-wins lookup) onto its duplicate(s). Falls back to the most
// recently updated row when no row has id === email. Never invalidates a
// currently-working password — only makes the inconsistent copy agree.
import mysql from "mysql2/promise";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  connectionLimit: 8,
  charset: "utf8mb4",
});

async function main() {
  const [rows] = await pool.query("SELECT id, data, updatedAt FROM `users`");
  const byEmail = new Map();
  for (const r of rows) {
    let parsed;
    try { parsed = JSON.parse(r.data || "{}"); } catch { continue; }
    const email = String(parsed.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push({ id: r.id, data: parsed, updatedAt: r.updatedAt });
  }

  let emailsFixed = 0, rowsUpdated = 0;
  const now = new Date().toISOString();
  const CONCURRENCY = 8;
  const entries = [...byEmail.entries()].filter(([, group]) => {
    if (group.length < 2) return false;
    const passwords = new Set(group.map(g => g.data.password || ""));
    return passwords.size > 1;
  });

  console.log(`Found ${entries.length} emails with mismatched duplicate passwords.`);

  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const [email, group] = entries[idx];
      const canonical =
        group.find(g => g.id.toLowerCase() === email) ||
        [...group].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
      const canonicalPassword = canonical.data.password;
      let changed = false;
      for (const g of group) {
        if (g.id === canonical.id || g.data.password === canonicalPassword) continue;
        const merged = { ...g.data, password: canonicalPassword };
        await pool.query("UPDATE `users` SET data = ?, updatedAt = ? WHERE id = ?", [JSON.stringify(merged), now, g.id]);
        rowsUpdated++;
        changed = true;
      }
      if (changed) emailsFixed++;
      if ((idx + 1) % 100 === 0) console.log(`  ...${idx + 1}/${entries.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(JSON.stringify({ emailsChecked: byEmail.size, emailsFixed, rowsUpdated }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
