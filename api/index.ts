import type { IncomingMessage, ServerResponse } from "http";
import { getApp } from "../server.js";

// Every request under /api/* is rewritten to this one static function (see
// vercel.json) rather than relying on the api/[...param].ts filesystem
// catch-all convention — that convention only matched single-segment paths
// on this deployment (e.g. /api/health worked, /api/session/login 404'd at
// Vercel's routing layer before ever reaching this handler). A rewrite to a
// fixed, non-dynamic function path sidesteps that limitation entirely.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
