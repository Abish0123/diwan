// One-off migration: drivers/helpers used to live in a separate
// transport_drivers table, disconnected from the real Staff directory.
// This copies every existing transport_drivers row into a real Staff
// record (department "Transport", role "Driver"/"Bus Helper") so the
// rebuilt Crew Registry / Bus Helpers / Vehicles pages — which now read
// and write Staff directly — see the crew that already existed.
// Idempotent: skips any transport_drivers row that already has a matching
// Staff record (same name + department "Transport"). Direct MySQL access
// (like scripts/backfill-student-parent-logins.mjs) since /api/data/* now
// requires an authenticated session.
import "dotenv/config";
import mysql from "mysql2/promise";
import crypto from "crypto";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT || 3306,
});

const UID = process.env.UID || "admin-001";

(async () => {
  console.log("Fetching transport_drivers and existing Staff…");
  const [driverRows] = await pool.execute("SELECT id, data FROM transport_drivers");
  const [staffRows] = await pool.execute("SELECT id, data FROM staff");

  const drivers = driverRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
  const staff = staffRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

  console.log(`  ${drivers.length} transport_drivers rows, ${staff.length} existing Staff rows`);

  const alreadyMigrated = new Set(
    staff.filter(s => s.department === "Transport").map(s => (s.name || "").trim().toLowerCase())
  );

  let created = 0, skipped = 0;
  const now = new Date().toISOString();
  for (const d of drivers) {
    const key = (d.name || "").trim().toLowerCase();
    if (!key || alreadyMigrated.has(key)) { skipped++; continue; }
    const role = d.role === "Helper" ? "Bus Helper" : "Driver";
    const id = `staff_${crypto.randomBytes(8).toString("hex")}`;
    const data = {
      id, name: d.name, role, department: "Transport", status: "Active",
      email: "", phone: d.phone || "",
      ...(role === "Driver" ? { licenseNumber: d.licenseNumber || undefined, licenseExpiry: d.licenseExpiry || undefined } : {}),
      assignedVehicleReg: d.vehicleReg || "",
      experienceYears: d.experience || 0,
      dutyStatus: d.status || "Available",
      rating: d.rating ?? 4.5,
      uid: UID, createdAt: now,
    };
    await pool.execute(
      "INSERT INTO staff (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
      [id, JSON.stringify(data), UID, now, now]
    );
    alreadyMigrated.add(key);
    created++;
  }

  console.log(`Done. Created ${created} Staff records, skipped ${skipped} already-migrated.`);
  await pool.end();
})();
