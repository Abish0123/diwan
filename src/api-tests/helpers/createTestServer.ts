/**
 * createTestServer — spawns the real Express server as a child process
 * on a random port and wraps it with a supertest agent + helpers.
 *
 * WHY A CHILD PROCESS:
 * Importing server.ts inside Vitest (even with environment: "node") triggers
 * Vite/esbuild transforms that crash due to a TextEncoder Uint8Array invariant.
 * Spawning a real Node process avoids the transform pipeline entirely.
 */
import { spawn } from "child_process";
import path from "path";
import http from "http";
import supertest from "supertest";

// src/api-tests/helpers → src/api-tests → src → project root (3 levels up)
const SERVER_ROOT = path.resolve(__dirname, "../../../");
// Resolve tsx binary from the project's own node_modules
const TSX_BIN = path.resolve(SERVER_ROOT, "node_modules", ".bin", "tsx");

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/api/health", method: "GET" },
        (res) => { res.resume(); resolve(); }
      );
      req.setTimeout(500);
      req.on("error", () => {
        if (Date.now() > deadline) {
          return reject(new Error(`Server on port ${port} did not start in ${timeoutMs}ms`));
        }
        setTimeout(attempt, 300);
      });
      req.end();
    }
    attempt();
  });
}

function randomPort(): number {
  return 20_000 + Math.floor(Math.random() * 9_999);
}

export interface TestServer {
  request: ReturnType<typeof supertest>;
  getAdminToken(): Promise<string>;
  getToken(email: string, password: string): Promise<string>;
  teardown(): Promise<void>;
}

export async function createTestServer(): Promise<TestServer> {
  const port = randomPort();

  // Build a clean env: inherit everything EXCEPT db vars that .env.local
  // might set, then force SQLite-only mode.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    // Force SQLite — no MySQL needed in tests
    DB_HOST: "skip-mysql",
    DATABASE_URL: "",
    DB_NAME: "",
    DB_USER: "",
    DB_PASSWORD: "",
    NODE_ENV: "test",
  };

  const child = spawn(TSX_BIN, ["server.ts"], {
    cwd: SERVER_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(d.toString()));
  child.stderr?.on("data", (d) => logs.push(d.toString()));

  child.on("error", (err) => {
    throw new Error(`Failed to spawn server: ${err.message}`);
  });

  try {
    await waitForPort(port, 30_000);
  } catch (err) {
    child.kill("SIGKILL");
    console.error("[createTestServer] Server logs:\n", logs.join(""));
    throw err;
  }

  const agent = supertest(`http://127.0.0.1:${port}`);

  async function getToken(email: string, password: string): Promise<string> {
    const res = await agent.post("/api/session/login").send({ email, password });
    if (!res.body?.token) {
      throw new Error(`getToken(${email}) failed ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  }

  return {
    request: agent,
    getAdminToken: () => getToken("admin@eduerp.com", "admin123"),
    getToken,
    teardown: () =>
      new Promise<void>((resolve) => {
        child.kill("SIGTERM");
        const t = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3_000);
        child.once("exit", () => { clearTimeout(t); resolve(); });
      }),
  };
}
