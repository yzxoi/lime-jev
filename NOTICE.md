# Credits and upstream notices

lime-jev is an independent community project, not an official release of lime, Laya, Jev, or TypeSafe.

## Thank you

- **[xushengfeng/lime](https://github.com/xushengfeng/lime)** — the foundation of this project: local, language-model-driven pinyin candidate generation, the TypeScript engine, pinyin indexing, and original Rime integration. This repository preserves lime's Git history and GPL-3.0 license. Starting revision: `fb1ebdbe0744766a7a7395f218d1305d2e920664`. The upstream README is preserved in `UPSTREAM_LIME_README.md`.
- **[NandhaKishorM/laya](https://github.com/NandhaKishorM/laya)** by Convai Innovations and contributors — the multilingual, open-weight decision model used for the optional local candidate-selection backend. Apache-2.0. Research reference: `839784f7c9b45139e0fb7ef60051ae9c3c9bab16`.
- **[mizorewww/laya-mlx](https://github.com/mizorewww/laya-mlx)** — the independent Apple Silicon MLX inference port, used as the `laya-mlx==0.2.0` dependency. Apache-2.0. Research reference: `0a859518634112655cb97c745dbf04f5191aaf13`.
- **[zhihz/openjev](https://github.com/zhihz/openjev)** — a useful reference for local candidate-label scoring and transparent evaluation. Consulted during research; not bundled as a runtime dependency.
- **[Rime / Squirrel](https://github.com/rime/squirrel)** — the macOS input-method host and the existing `luna_pinyin` dictionary fallback. Installed separately; not redistributed here.
- **Qwen, Unsloth, MLX, node-llama-cpp**, and their contributors — the open models, conversions and inference tooling underlying this project.

## Licensing and models

The derivative application code is licensed under GPL-3.0; see `LICENSE`. Third-party libraries retain their own licenses and notices. This does not relicense Laya, laya-mlx, Rime, or model weights.

Model weights are downloaded separately, never committed to this repository. The repository IDs, immutable revisions, sizes and SHA-256 checksums are recorded in `scripts/models.json`. Consult the respective model cards for their licenses:

- [Qwen3-0.6B GGUF conversion](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF), [original Qwen model](https://huggingface.co/Qwen/Qwen3-0.6B).
- [Laya multilingual MLX conversion](https://huggingface.co/aac6fef/laya-multilingual-mlx), [original Laya model](https://huggingface.co/convaiinnovations/laya-multilingual).

The name “jev” describes the inspiration for a structured candidate-selection interface. This project contains no proprietary Jev weights or code and makes no Jev API calls. It is not affiliated with TypeSafe.
