import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Forward all /api and /socket.io requests to Express (port 3000).
      // Without this, Vite intercepts /api calls and returns HTML — causing
      // "Unexpected token 'A'" JSON parse errors in the frontend.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  define: {
    "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY || ""),
    // Vercel's serverless invocation model (api/index.ts calling the Express
    // app directly, per-request, with no persistent httpServer) means the
    // Socket.IO server in server.ts never actually attaches there — only the
    // traditional `httpServer.listen()` path does. Surfacing that at build
    // time lets the client skip trying to open a socket connection that can
    // never succeed, instead of retrying in a tight, connection-starving loop.
    "import.meta.env.VITE_IS_VERCEL": JSON.stringify(!!process.env.VERCEL),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    entries: ["index.html"],
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "leaflet"],
    exclude: ["react-leaflet", "@react-leaflet/core"],
  },
}));
