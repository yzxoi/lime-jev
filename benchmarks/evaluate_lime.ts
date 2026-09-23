import { initLIME } from "../main.ts";
import { load_pinyin } from "../key_map/pinyin/gen_zi_pinyin.ts";
import { keys_to_pinyin } from "../key_map/pinyin/keys_to_pinyin.ts";

const lime = await initLIME({
  ziInd: load_pinyin(),
  gpu: "metal",
  modelPath: "models/lime/Qwen3-0.6B-IQ4_XS.gguf",
  contextSize: 1024,
  omitContext: false,
});
const cases = JSON.parse(await Deno.readTextFile("benchmarks/cases.json")) as {
  context: string;
  pinyin: string;
  candidates: string[];
  acceptable: string[];
}[];
const baseline = Deno.args.includes("--baseline");
const results = [];
for (const c of cases) {
  const started = performance.now();
  await lime.set_context(c.context);
  const result = await (baseline
    ? lime.single_ci(keys_to_pinyin(c.pinyin))
    : lime.contextual_candidates(keys_to_pinyin(c.pinyin)));
  const words = result.candidates.slice(0, 8).map((c) =>
    c.word
  );
  const row = {
    ...c,
    actual: words,
    correct: c.acceptable.includes(words[0]),
    recalled: words.some((w) => c.acceptable.includes(w)),
    elapsed_ms: performance.now() - started,
  };
  results.push(row);
  console.log(
    c.context,
    words.slice(0, 5),
    row.correct,
    Math.round(row.elapsed_ms),
  );
}
await Deno.writeTextFile(
  baseline ? ".runtime/lime-baseline.json" : ".runtime/lime-evaluation.json",
  JSON.stringify(
    {
      count: results.length,
      correct: results.filter((r) => r.correct).length,
      recalled: results.filter((r) => r.recalled).length,
      results,
    },
    null,
    2,
  ),
);
console.log(
  "done",
  results.filter((r) => r.correct).length,
  "/",
  results.length,
);
await lime.context.dispose();
await lime.model.dispose();
