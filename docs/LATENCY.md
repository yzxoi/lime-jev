# 候选延迟修复与验证

2026-09-24，Apple M3 Max、64 GiB、macOS 26.6.2。使用相同 Qwen3-0.6B IQ4_XS 权重和 Metal，Laya 重排关闭。本次比较修复前的 `8be1fa1` 与延迟修复提交 `df63d9f`，不代表完整还原项目开始前的个人输入环境。以下保留当时的实测数据；后续 main 默认关闭模糊拼音，这里尚未重新测量该设置下的延迟。

## 改动

原来的短词搜索在一次按键上最多连续进行四次模型计算；超过四个音节后切回另一条长句路径，不能完整复用短词缓存。提交文字也只保存到会话，模型上下文留到下一次按键才更新。同步 Lua 会把这些等待直接传递给候选窗口。

现在的实现：

- 普通相邻按键或退格最多新增一次模型推理；首次完整词组、粘贴或大幅修改最多两次。已有缓存分支仍可继续使用。开始新推理前检查 50 ms 预算，单次原生计算不能被中断，因此这是软预算。
- 起始分支限制为概率最高的三个；已有单 token 候选仍保留。分支概率即使作为上界也无法超过当前首选时，提前停止。用拼音索引查概率，避免反复扫描整个词表。
- 长短词共用分支缓存，不再在第五个音节切换算法；缓存最多保留 24 条路径，每次回复最多 64 个模型候选。
- `/commit` 立即确认，并在串行队列中提前准备上下文。新的提交、清空或应用切换会替代尚未执行的旧准备任务；失败后重新构造上下文。排队期间失效的候选请求会被丢弃。服务端耗时指标计入排队等待。
- Lua 候选请求最长等待从 1.5 秒改为 250 ms，超时后允许 Rime 词典继续提供候选。提交与清空请求仍使用原来的独立超时。

这仍是同步候选接口，没有声称实现“先显示词典、再异步刷新”的交互。词组搜索范围缩小可能影响其他输入的候选，需要继续观察实际使用。

## 方法

使用鼠须管自带 librime 与 librime-lua，在独立临时配置中发送合成按键，通过真实 Lua → curl → HTTP → 模型链路处理。测试包含“汽车”后的 `youxiang`、“我现在”后的 `youxiang` 和“我”后的 `jintiantianqihenhao`，前文也逐键输入并上屏。

每种版本各测试两种节奏：零间隔连续调用，以及每次处理返回后等待 100 ms 再按下一键。每种节奏执行两轮，共 70 个目标按键、40 个前文及空格按键。每键计时包括 `process_key` 和 `get_context`，不包含人为设置的 100 ms 间隔，也不包含应用候选窗口绘制。另计空格上屏时间，检查是否只是把卡顿挪到空格。

采用 nearest-rank P95。顺序运行修复前、修复后；不是随机交错实验，不能据此外推所有 Mac、应用和输入内容。生产模型常驻但测试期间未主动发送生产输入。

## 结果

下表只统计每组 70 个目标按键：

| 节奏 | 版本 | P50 | P95 | 最大值 | 按键处理总时间 |
| --- | --- | ---: | ---: | ---: | ---: |
| 返回后间隔 100 ms | 修复前 | 37.2 ms | 173.7 ms | 222.6 ms | 4561 ms |
| 返回后间隔 100 ms | 修复后 | 20.8 ms | 82.1 ms | 89.9 ms | 2950 ms |
| 零间隔连续调用 | 修复前 | 33.4 ms | 173.2 ms | 207.9 ms | 4438 ms |
| 零间隔连续调用 | 修复后 | 50.6 ms | 72.8 ms | 77.8 ms | 2935 ms |

100 ms 间隔测试的 P95 下降约 53%，整段目标按键的处理时间下降约 35%。零间隔测试的尾部等待和总等待也下降，但 **P50 变高**：一次长计算被限制后，部分工作分布到后续按键，而提交后的准备没有足够空隙完成。因此不能声称所有按键都比旧版更快，或已达到纯词典输入法的响应速度。

空格上屏的 P50：间隔测试 14.8 → 15.4 ms，零间隔测试 14.7 → 15.1 ms，没有把几十毫秒的上下文计算同步挪到空格。计入前文与空格的 110 个按键，间隔测试总处理时间为 6761 → 4456 ms。

两种节奏、两轮测试的最终首选都保持“油箱”“又想”“今天天气很好”。每种版本 204 次候选请求（包含前文）中，候选阶段原生计算从 120 次减少到 80 次；最大回复从 93,281 字节、856 个候选，降到 9,935 字节、64 个候选。

原始逐键数据：[修复前零间隔](results/latency-before-zero.tsv)、[修复后零间隔](results/latency-after-zero.tsv)、[修复前间隔测试](results/latency-before-paced.tsv)、[修复后间隔测试](results/latency-after-paced.tsv)。完整统计见 [JSON](results/latency-comparison.json)，输入均为上述合成内容。

## 选词与功能回归

同一组 [32 个开发样例](../benchmarks/cases.json)，[完整拼音单次输入](results/lime-latency-fix-evaluation.json)与[逐键输入](results/lime-latency-fix-typing.json)均为首选 30 / 32、目标召回 31 / 32；与修复前完整词组测试相同。仍然错在“处理 gongshi”和“耐用的 gangkou”。这组样例参与了实现验证，不是盲测，不能外推日常准确率。

[上下文替换逐键测试](results/lime-latency-fix-smoke.json)也通过，包括“油箱 / 又想 / 邮箱”以及再次切回“汽车”的语境。24 个 Deno 测试、4 个安装与服务管理测试通过，新增覆盖了后台准备失败后的恢复、清空时丢弃排队请求、长句缓存跨越四音节、退格和提交边界。另用故意延迟 700 ms 的临时服务验证：5 次候选请求在约 1.4 秒内完成词典回退，不会逐键等满 700 ms。

本机完成后台服务重启、Lua 重新部署，并通过正式服务的真实 Rime 链路测试。重启时曾遇到 launchd 卸载尚未结束的短暂错误；管理脚本现在对该错误做有上限的重试，持续失败仍明确报错。

## 复现

先按 [Rime 测试说明](RIME_TEST.md)准备 `.runtime/rime-smoke`，只复制项目方案和 Lua，不复制个人用户词典。创建独立性能测试配置，将其服务地址改到测试端口，保留文件中的本地密钥：

```bash
cp -R .runtime/rime-smoke .runtime/latency-current
.venv/bin/python - <<'PY'
from pathlib import Path
p = Path('.runtime/latency-current/lua/lime_jev_config.lua')
p.write_text(p.read_text().replace(':17864', ':17866'))
PY
xcrun clang++ -std=c++17 benchmarks/rime_latency.cc -I.upstream/librime/src \
  '/Library/Input Methods/Squirrel.app/Contents/Frameworks/librime.1.dylib' \
  -Wl,-rpath,'/Library/Input Methods/Squirrel.app/Contents/Frameworks' \
  -o .runtime/rime-latency
deno run -A benchmarks/latency_server.ts --output=.runtime/latency-after.jsonl
```

等待服务显示 `Listening on http://127.0.0.1:17866/`，在另一个终端运行：

```bash
.runtime/rime-latency "$PWD/.runtime/latency-current" lime_jev 0 > .runtime/latency-after-zero.tsv
.runtime/rime-latency "$PWD/.runtime/latency-current" lime_jev 100 > .runtime/latency-after-paced.tsv
.venv/bin/python benchmarks/summarize_latency.py .runtime/latency-after-zero.tsv .runtime/latency-after-paced.tsv
```

TSV 列依次为轮次、用例编号、`prefix/target`、已输入按键、耗时毫秒、第一候选。测试服务会记录这些合成输入，仅用于独立测试配置；不要把日常输入法配置连接到它。完成后在服务终端按 Ctrl+C 停止。

对照旧版时先停止测试服务，然后提取固定提交的源文件；基线 Rime 配置须使用该提交的 Lua：

```bash
mkdir -p .runtime/latency-baseline
git archive 8be1fa1 main.ts app key_map utils assets | tar -x -C .runtime/latency-baseline
cp -R .runtime/latency-current .runtime/latency-before
git show 8be1fa1:rime/lua/lime_jev.lua > .runtime/latency-before/lua/lime_jev.lua
deno run -A benchmarks/latency_server.ts --source=.runtime/latency-baseline --output=.runtime/latency-before.jsonl
```

仍在另一个终端用 `.runtime/latency-before` 重跑同样两种节奏，分别保存输出。单词准确性和逐键选词诊断可运行 `deno run -A benchmarks/evaluate_lime.ts` 与 `deno run -A benchmarks/evaluate_lime.ts --typing`；两者分别保存到 `.runtime/lime-evaluation.json` 与 `.runtime/lime-typing-evaluation.json`。

## 安装更新

```bash
git pull --ff-only
./lime-jev restart
./lime-jev install-rime
./lime-jev use lime
```

若停留在发布标签，先 `git switch main`。继续使用“Lime · 本地语境”方案，无需重新下载模型。
