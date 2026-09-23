import type { ZiIndAndKey, ZiIndL } from "../zi_ind.ts";
import { generate_pinyin } from "./all_pinyin.ts";
import {
	type FuzzyPinyinConfig,
	generate_fuzzy_pinyin,
} from "./fuzzy_pinyin.ts";
import {
	generate_shuang_pinyin,
	type ShuangpinMap,
	shuangpinMaps,
} from "./shuangpin.ts";

export type PinyinToKeyOptions = {
	shuangpin?: keyof typeof shuangpinMaps | false | ShuangpinMap;
	fuzzy?: FuzzyPinyinConfig;
};

const pinyin_k_l = generate_pinyin().toSorted((a, b) => b.length - a.length);

export function key_to_pinyin_part(
	k: string,
	shuangpinMap: ReturnType<typeof generate_shuang_pinyin>,
): ZiIndAndKey[] {
	// Keep the longest unfinished syllable together ("yo" -> you/yong),
	// rather than treating every leading letter as a separate abbreviation.
	for (let plen = k.length; plen > 0; plen--) {
		const xk = k.slice(0, plen);
		let nxk = xk;
		const ll: ZiIndAndKey[] = [];
		for (const [i, pys] of Object.entries(shuangpinMap)) {
			for (const py of pys)
				if (i.startsWith(xk)) {
					const next = k.at(xk.length);
					if (next === split_key) {
						nxk = xk + split_key;
					}
					ll.push({
						ind: py,
						key: nxk,
						preeditShow: ["zh", "ch", "sh"].includes(py.slice(0, 2))
							? py.slice(0, 2)
							: py[0],
					});
				}
		}
		for (const i of pinyin_k_l) {
			if (i.startsWith(xk)) {
				const next = k.at(xk.length);
				if (next === split_key) {
					nxk = xk + split_key;
				}
				ll.push({
					ind: i,
					key: nxk,
					preeditShow: xk,
				});
			}
		}
		if (ll.length) {
			return ll;
		}
	}
	return [];
}

const split_key = "'";

export function keys_to_pinyin(keys: string, op?: PinyinToKeyOptions): ZiIndL {
	const l: ZiIndL = [];
	let k = keys;
	if (keys.startsWith(split_key)) return [];
	const shuangpinMap = op?.shuangpin
		? generate_shuang_pinyin(
				pinyin_k_l,
				typeof op.shuangpin === "string"
					? shuangpinMaps[op.shuangpin]
					: op.shuangpin,
			)
		: {};

	function tryMatch(k: string): {
		restK: string;
		l: ZiIndAndKey[];
		matchMore: boolean;
	} {
		const kl: { i: string; pinyin: string }[] = [];
		for (const i in shuangpinMap) {
			for (const x of shuangpinMap[i]) kl.push({ i, pinyin: x });
		}
		for (const i of pinyin_k_l) {
			kl.push({ i, pinyin: i });
		}
		for (const { i, pinyin } of kl) {
			if (k.startsWith(i)) {
				const pinyin_variants = generate_fuzzy_pinyin(pinyin, op?.fuzzy);

				let ni = i;
				const next = k.at(i.length);
				if (next === split_key) {
					ni = i + split_key;
				}

				const ll = pinyin_variants.map((py) => ({
					ind: py,
					key: ni,
					preeditShow: py,
				}));
				k = k.slice(ni.length);
				if (["a", "e", "o", "m", "n"].includes(i)) {
					return { restK: k, l: ll, matchMore: true }; //即使我们添加了这个单字母拼音，但是还是让它匹配更长的拼音
				}
				return { restK: k, l: ll, matchMore: false };
			}
		}
		return { restK: k, l: [], matchMore: true };
	}

	let _count = 0;
	while (k.length > 0) {
		_count++;
		if (_count > keys.length * 2) {
			console.error("keys_to_pinyin possible infinite loop:", {
				keys,
				op,
				l,
				k,
			});
			break;
		}

		if (k.startsWith(split_key)) {
			l.push([{ ind: "*", key: split_key, preeditShow: "*" }]);
			k = k.slice(1);
		}
		// A trailing unfinished syllable is one unit: qio is a prefix of qiong,
		// not qi + o. Keep abbreviation splitting for strings such as nh.
		if (!op?.shuangpin && k && !pinyin_k_l.includes(k)) {
			const completions = pinyin_k_l.filter((py) => py.startsWith(k));
			if (completions.length) {
				l.push(completions.map((ind) => ({ ind, key: k, preeditShow: k })));
				k = "";
				continue;
			}
		}
		let { restK: nk, l: ll, matchMore } = tryMatch(k);

		if (matchMore) {
			const partial = key_to_pinyin_part(k, shuangpinMap);
			const consumed = partial[0]?.key.length ?? 0;
			if (consumed > k.length - nk.length) {
				ll = partial;
				nk = k.slice(consumed);
			} else {
				ll.push(...partial);
			}
		}
		k = k === nk ? k.slice(1) : nk;
		if (ll.length) l.push(ll);
	}
	return l;
}
