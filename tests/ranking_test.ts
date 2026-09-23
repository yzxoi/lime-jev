import { assertEquals } from "@std/assert";
import { LocalRanker, promote, shortlist } from "../app/ranking.ts";
import { Controller } from "../app/controller.ts";
import type { Candidate } from "../main.ts";

function candidate(word: string, length = 8): Candidate {
  return {
    word,
    score: 0.1,
    consumedkeys: length,
    pinyin: ["you", "xiang"],
    preedit: "you xiang",
    remainkeys: [],
  };
}
const candidates = [candidate("邮箱"), candidate("油箱"), candidate("有", 3)];

Deno.test("promote preserves commit boundaries and the other candidates' order", () => {
  const result = promote(candidates, "油箱");
  assertEquals(result, [candidates[1], candidates[0], candidates[2]]);
  assertEquals(result[0] === candidates[1], true);
  assertEquals(shortlist(candidates, "youxiang").map((c) => c.word), [
    "邮箱",
    "油箱",
  ]);
  assertEquals(promote(candidates, "不存在"), candidates);
});

Deno.test("a dead decision service leaves the exact original list available", async () => {
  const ranker = new LocalRanker("http://127.0.0.1:1", "test", 20);
  const result = await ranker.rank("汽车", "youxiang", candidates, "laya");
  assertEquals(result.candidates, candidates);
  assertEquals(result.ranking.applied, false);
});

Deno.test("focus change during inference discards stale output", async () => {
  let finish!: () => void;
  const started = Promise.withResolvers<void>();
  const controller = new Controller({
    setContext: async () => {},
    append: async () => {},
    candidates: async () => {
      started.resolve();
      await new Promise<void>((r) => finish = r);
      return candidates;
    },
  }, new LocalRanker("http://127.0.0.1:1", "test", 20));
  controller.sessions.commit("rime", "汽车");
  const pending = controller.candidates(
    "rime",
    "youxiang",
    "",
    undefined,
    "off",
  );
  await started.promise;
  controller.reset();
  finish();
  assertEquals(await pending, { candidates: [], stale: true });
});

Deno.test("explicit editor context replaces history rather than appending twice", async () => {
  const seen: string[] = [];
  const controller = new Controller({
    setContext: (text) => {
      seen.push(text);
      return Promise.resolve();
    },
    append: (text) => {
      seen.push("+" + text);
      return Promise.resolve();
    },
    candidates: () => Promise.resolve(candidates),
  }, new LocalRanker("http://127.0.0.1:1", "test", 20));
  await controller.candidates("web", "youxiang", "", "汽车", "off");
  await controller.candidates("web", "youxiang", "", "汽车的", "off");
  await controller.candidates("web", "youxiang", "", "我的", "off");
  assertEquals(seen, ["汽车", "+的", "我的"]);
});
