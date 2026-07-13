import { io } from "socket.io-client";

// On Vercel there is no persistent httpServer for the Socket.IO server in
// server.ts to attach to (see api/index.ts) — a real-time connection can
// never succeed there. Without this guard, socket.io-client's default
// infinite-reconnection behavior retries in a tight loop against a server
// that will never answer correctly, saturating the browser's per-origin
// connection limit and starving out real API requests. The app already has
// a DB-polling fallback (see useNotifications.ts) that works fine without
// a live socket, so on Vercel we simply never attempt to connect.
const socket = io({
  autoConnect: !import.meta.env.VITE_IS_VERCEL,
  reconnectionAttempts: import.meta.env.VITE_IS_VERCEL ? 0 : Infinity,
});

export default socket;
