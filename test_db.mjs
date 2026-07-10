import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

async function clearNotifications() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  
  try {
    const [[before]] = await connection.execute("SELECT COUNT(*) as total FROM notifications");
    console.log(`Notifications before: ${before.total}`);
    await connection.execute("DELETE FROM notifications");
    const [[after]] = await connection.execute("SELECT COUNT(*) as total FROM notifications");
    console.log(`Notifications after:  ${after.total}`);
    console.log("Done — notifications table cleared.");
  } catch (error) {
    console.error("Failed:", error.message);
  } finally {
    await connection.end();
  }
}

clearNotifications().catch(console.error);
