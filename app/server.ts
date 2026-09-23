import { initLIME } from "../main.ts";
import { load_pinyin } from "../key_map/pinyin/gen_zi_pinyin.ts";
import { keys_to_pinyin } from "../key_map/pinyin/keys_to_pinyin.ts";
import { Controller } from "./controller.ts";
import { LocalRanker } from "./ranking.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const runtime = path.join(ROOT, ".runtime");
const token = Deno.readTextFileSync(path.join(runtime, "token")).trim();
const port = Number(Deno.env.get("LIME_JEV_PORT") ?? 17864);
const workerPort = Number(Deno.env.get("LIME_JEV_WORKER_PORT") ?? 17865);
const settingsPath = path.join(runtime, "settings.json");
let backend = "off";
try {
  const settings = JSON.parse(Deno.readTextFileSync(settingsPath));
  if (["off", "laya"].includes(settings.backend)) backend = settings.backend;
} catch { /* First start uses the default. */ }

console.log("lime-jev: loading local pinyin model…");
const lime = await initLIME({
  modelPath: path.join(ROOT, "models/lime/Qwen3-0.6B-IQ4_XS.gguf"),
  contextSize: 1024,
  gpu: Deno.env.get("LIME_JEV_CPU") === "1" ? false : "metal",
  ziInd: load_pinyin(),
  omitContext: false,
});
const controller = new Controller(
  {
    setContext: lime.set_context,
    append: async (text) => {
      await lime.commit(text);
      await lime.getEvalResult();
    },
    candidates: async (keys) =>
      (await lime.contextual_candidates(keys_to_pinyin(keys))).candidates,
  },
  new LocalRanker(`http://127.0.0.1:${workerPort}`, token, 100),
  "",
);
let activeApp = "";
let focusWatchAt = 0;
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function authorized(request: Request) {
  // Same-origin browser requests and native clients only; no permissive CORS.
  const origin = request.headers.get("Origin");
  if (
    origin && origin !== `http://127.0.0.1:${port}` &&
    origin !== `http://localhost:${port}`
  ) return false;
  return request.headers.get("Authorization") === `Bearer ${token}`;
}
function string(value: unknown, max: number, fallback = "") {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max) {
    throw new Error("invalid-input");
  }
  return value;
}
console.log(`lime-jev ready at http://127.0.0.1:${port}`);
Deno.serve({ hostname: "127.0.0.1", port }, async (request) => {
  const url = new URL(request.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    return json({ error: "Invalid host" }, 403);
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ready: true, name: "lime-jev", version: "0.1.0" });
  }
  if (request.method === "GET" && url.pathname === "/") {
    return new Response(
      await Deno.readTextFile(path.join(ROOT, "web/index.html")),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
        },
      },
    );
  }
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET" && url.pathname === "/api/status") {
    let worker = { ready: false };
    try {
      worker = await (await fetch(`http://127.0.0.1:${workerPort}/health`, {
        signal: AbortSignal.timeout(300),
      })).json();
    } catch { /* Fallback remains available. */ }
    return json({
      backend,
      worker,
      focus_watch: Date.now() - focusWatchAt < 15_000,
      privacy: "local-only",
      version: "0.1.0",
    });
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(raw);
    const session = string(body.session, 64, "rime");
    if (url.pathname === "/candidates" || url.pathname === "/api/candidates") {
      const keys = string(body.keys, 64).toLowerCase();
      if (!/^[a-z']*$/.test(keys)) {
        return json({ error: "Use full pinyin letters" }, 400);
      }
      const prefix = string(body.preedit, 128);
      const context = body.context === undefined
        ? undefined
        : string(body.context, 256);
      const selectedBackend = body.backend === "off" ? "off" : backend;
      if (!keys) return json({ candidates: [] });
      return json(
        await controller.candidates(
          session,
          keys,
          prefix,
          context,
          selectedBackend,
        ),
      );
    }
    if (url.pathname === "/commit") {
      controller.commit(session, string(body.text, 256));
      return json({ ok: true });
    }
    if (url.pathname === "/reset" || url.pathname === "/api/reset") {
      controller.reset(session);
      return json({ ok: true });
    }
    if (url.pathname === "/focus") {
      const app = string(body.app, 256);
      focusWatchAt = Date.now();
      if (activeApp !== app) {
        activeApp = app;
        controller.reset();
      }
      return json({ ok: true });
    }
    if (url.pathname === "/api/settings") {
      if (!["laya", "off"].includes(body.backend)) {
        return json({ error: "Unknown backend" }, 400);
      }
      backend = body.backend;
      await Deno.writeTextFile(settingsPath, JSON.stringify({ backend }), {
        mode: 0o600,
      });
      return json({ ok: true, backend });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    // Never print request text or committed history.
    return json({
      error: error instanceof Error && error.message === "busy"
        ? "busy"
        : "Request failed",
    }, 400);
  }
});
