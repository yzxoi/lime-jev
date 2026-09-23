import { assertEquals } from "@std/assert";
import { keys_to_pinyin } from "../key_map/pinyin/keys_to_pinyin.ts";

Deno.test("unfinished syllables stay together while typing", () => {
  for (
    const [keys, spelling] of [["yo", "you"], ["zho", "zhong"], [
      "qio",
      "qiong",
    ]]
  ) {
    const result = keys_to_pinyin(keys);
    assertEquals(result.length, 1, keys);
    assertEquals(result[0].some((p) => p.ind === spelling), true);
    assertEquals(result[0].every((p) => p.key === keys), true);
  }
});

Deno.test("full pinyin and initial abbreviations preserve exact consumed keys", () => {
  for (const keys of ["youxiang", "nihao", "zhongguo", "nh", "xi'an", "youx"]) {
    const result = keys_to_pinyin(keys);
    assertEquals(result.map((p) => p[0].key).join(""), keys);
  }
  assertEquals(keys_to_pinyin("youxiang").map((p) => p[0].ind), [
    "you",
    "xiang",
  ]);
});
