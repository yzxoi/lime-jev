// Synthetic benchmark only: unlike the production server, this writes input
// text to a local report. Connect only an isolated Rime test profile to it.
import { parseArgs } from "@std/cli/parse-args";
import { resolve, toFileUrl } from "@std/path";
import { LocalRanker } from "../app/ranking.ts";

const args = parseArgs(Deno.args, { string: ["source", "output"] });
const source = resolve(args.source ?? ".");
const output = args.output ?? ".runtime/latency-after.jsonl";
const { initLIME } = await import(toFileUrl(resolve(source, "main.ts")).href);
const { Controller } = await import(
  toFileUrl(resolve(source, "app/controller.ts")).href
);
const { load_pinyin } = await import(
  toFileUrl(resolve(source, "key_map/pinyin/gen_zi_pinyin.ts")).href
);
const { keys_to_pinyin } = await import(
  toFileUrl(resolve(source, "key_map/pinyin/keys_to_pinyin.ts")).href
);
const lime = await initLIME({
  modelPath: "models/lime/Qwen3-0.6B-IQ4_XS.gguf",
  contextSize: 1024,
  gpu: "metal",
  ziInd: load_pinyin(),
  omitContext: false,
});
Deno.writeTextFileSync(output, "");
const log = (row: unknown) =>
  Deno.writeTextFileSync(output, JSON.stringify(row) + "\n", { append: true });
let phase = "", keys = "", context = "";
const evaluate = lime.sequence.controlledEvaluate.bind(lime.sequence);
lime.sequence.controlledEvaluate = async (...args: unknown[]) => {
  const started = performance.now();
  const owner = { phase, keys };
  try {
    return await evaluate(...args);
  } finally {
    log({ event: "inference", ...owner, ms: performance.now() - started });
  }
};
const controller = new Controller(
  {
    setContext: async (text: string) => {
      phase = "context";
      context = text;
      await lime.set_context(text);
    },
    append: async (text: string) => {
      phase = "context";
      context += text;
      await lime.commit(text);
    },
    candidates: async (input: string) => {
      phase = "candidates";
      keys = input;
      return (await lime.contextual_candidates(keys_to_pinyin(input)))
        .candidates;
    },
  },
  new LocalRanker("http://127.0.0.1:1", "none", 1),
  "",
);
const token = Deno.readTextFileSync(".runtime/token").trim();
Deno.writeTextFileSync(".runtime/latency-server.pid", String(Deno.pid));
Deno.serve({ hostname: "127.0.0.1", port: 17866 }, async (request) => {
  if (request.headers.get("Authorization") !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const path = new URL(request.url).pathname;
  if (path === "/health") return Response.json({ ready: true });
  const body = await request.json();
  if (path === "/commit") {
    if (controller.commit) controller.commit("latency", body.text);
    else controller.sessions.commit("latency", body.text);
  } else if (path === "/reset") controller.reset();
  else if (path === "/candidates") {
    const started = performance.now();
    const result = await controller.candidates(
      "latency",
      body.keys,
      body.preedit || "",
      body.context,
      "off",
    );
    const payload = JSON.stringify(result);
    log({
      event: "candidates",
      keys: body.keys,
      context,
      first: result.candidates[0]?.word,
      count: result.candidates.length,
      bytes: new TextEncoder().encode(payload).length,
      elapsed_ms: result.elapsed_ms,
      wall_ms: performance.now() - started,
    });
    return new Response(payload, {
      headers: { "Content-Type": "application/json" },
    });
  }
  return Response.json({ ok: true });
});
