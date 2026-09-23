"""The decision models never generate or transmit the user's text."""
from pathlib import Path
from time import perf_counter


class LayaRanker:
    def __init__(self, model_dir: Path):
        import laya_mlx
        self.agent = laya_mlx.load(str(model_dir), dtype="float16", device="gpu")

    def rank(self, context: str, pinyin: str, candidates: list[str]):
        started = perf_counter()
        # Keep the shared prefix in state, not in every option. Otherwise long
        # prefixes exhaust Laya's option budget and truncate away the actual words.
        criteria = {f"c{i}": candidate for i, candidate in enumerate(candidates)}
        result = self.agent.predict(
            {"已输入的文字": context, "正在输入的拼音": pinyin},
            {"word": {
                "type": "choice",
                "instructions": "选择接在已输入文字后最自然、语义最连贯的下一个中文词。",
                "criteria": criteria,
            }},
        )["answers"]["word"]
        probabilities = {word: result["probabilities"][f"c{i}"] for i, word in enumerate(candidates)}
        return {
            "choice": candidates[int(result["choice"][1:])],
            "probabilities": probabilities,
            "elapsed_ms": round((perf_counter() - started) * 1000, 2),
            "backend": "laya",
        }
