import { assertEquals, assertLessOrEqual } from "@std/assert";
import type { LlamaContext, LlamaModel, Token } from "node-llama-cpp";
import { LIME } from "../main.ts";
import type { ZiIndL } from "../key_map/zi_ind.ts";

// A tiny deterministic vocabulary exercises sequence mutation and cache reuse
// without requiring model downloads or a GPU on CI.
function fixture() {
  const vocabulary = ["", "甲", "乙", "丙", "丁", "戊", "己", "庚", "钾"];
  const spelling = ["", "a", "b", "c", "d", "e", "f", "g", "a"];
  let evaluations = 0;
  const sequence = {
    contextTokens: [] as number[],
    clearHistory() {
      this.contextTokens = [];
      return Promise.resolve();
    },
    eraseContextTokenRanges(ranges: { start: number; end: number }[]) {
      for (const { start, end } of ranges) {
        this.contextTokens.splice(start, end - start);
      }
      return Promise.resolve();
    },
    controlledEvaluate(input: (number | [number, unknown])[]) {
      evaluations++;
      const ids = input.map((v) => typeof v === "number" ? v : v[0]);
      this.contextTokens.push(...ids);
      const last = ids.at(-1)!;
      const probabilities = last === 0
        ? new Map([[1, 0.7], [8, 0.3]])
        : new Map([[last === 8 ? 2 : last + 1, 0.9]]);
      return Promise.resolve([{ next: { probabilities } }]);
    },
  };
  const lime = new LIME({
    model: {
      iterateAllTokens: () => vocabulary.keys(),
      detokenize: (ids: number[]) => ids.map((id) => vocabulary[id]).join(""),
      tokenizer: () => [0 as Token],
    } as unknown as LlamaModel,
    context: {
      contextSize: 1024,
      getSequence: () => sequence,
    } as unknown as LlamaContext,
    ziInd: {
      trans: (word) => {
        const py = spelling[vocabulary.indexOf(word)];
        return py ? [[py]] : [];
      },
      allSymbol: new Set(),
    },
    omitContext: false,
  });
  return { lime, sequence, evaluations: () => evaluations };
}
const input = (keys: string): ZiIndL =>
  [...keys].map((key) => [{ ind: key, key, preeditShow: key }]);

Deno.test("incremental search shares cached paths beyond four syllables with one forward per key", async () => {
  const { lime, evaluations, sequence } = fixture();
  await lime.init_ctx();
  for (let length = 1; length <= 7; length++) {
    const before = evaluations();
    const result = await lime.contextual_candidates(
      input("abcdefg".slice(0, length)),
    );
    assertLessOrEqual(evaluations() - before, 1);
    assertEquals(result.candidates[0].word, "甲乙丙丁戊己庚".slice(0, length));
    assertEquals(result.candidates[0].consumedkeys, length);
    assertEquals(sequence.contextTokens, [0]);
  }
});

Deno.test("commit invalidates branch probabilities and backspace preserves commit boundaries", async () => {
  const { lime, evaluations, sequence } = fixture();
  await lime.init_ctx();
  await lime.contextual_candidates(input("a"));
  await lime.contextual_candidates(input("ab"));
  const shortened = await lime.contextual_candidates(input("a"));
  assertEquals(shortened.candidates[0].consumedkeys, 1);
  await lime.commit("前文");
  const before = evaluations();
  const result = await lime.contextual_candidates(input("ab"));
  assertEquals(evaluations() > before, true);
  assertLessOrEqual(evaluations() - before, 2);
  assertEquals(result.candidates[0].word, "甲乙");
  assertEquals(sequence.contextTokens, [0, 0]);
});
