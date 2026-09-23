import { assertEquals } from "@std/assert";
import { initLIME } from "../main.ts";
import { load_pinyin } from "../key_map/pinyin/gen_zi_pinyin.ts";
import { keys_to_pinyin } from "../key_map/pinyin/keys_to_pinyin.ts";

const lime = await initLIME({
  ziInd: load_pinyin(),
  gpu: "metal",
  contextSize: 1024,
  modelPath: "models/lime/Qwen3-0.6B-IQ4_XS.gguf",
  omitContext: false,
});
const report = [];
for (
  const [context, expected] of [["汽车", "油箱"], ["我现在", "又想"], [
    "请把附件发到我的",
    "邮箱",
  ], ["汽车", "油箱"]]
) {
  await lime.set_context(context);
  const strokes = [];
  let first = "";
  for (let i = 1; i <= 8; i++) {
    const keys = "youxiang".slice(0, i), start = performance.now();
    const result = await lime.contextual_candidates(keys_to_pinyin(keys));
    first = result.candidates[0]?.word;
    strokes.push({
      keys,
      first,
      elapsed_ms: Math.round((performance.now() - start) * 100) / 100,
    });
  }
  assertEquals(first, expected, context);
  report.push({ context, expected, strokes });
  console.log(context, expected, strokes);
}
await Deno.writeTextFile(
  ".runtime/typing-smoke.json",
  JSON.stringify(report, null, 2),
);
await lime.context.dispose();
await lime.model.dispose();
console.log(
  "PASS: context-sensitive full-pinyin typing, including context replacement.",
);
