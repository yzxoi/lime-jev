# lime-jev

**让中文输入法根据正在写的内容，选择更合适的第一候选。**

基于 [lime](https://github.com/xushengfeng/lime) 的本地拼音引擎，接入 [Laya](https://github.com/NandhaKishorM/laya) 多语言决策模型，通过 [laya-mlx](https://github.com/mizorewww/laya-mlx) 在 Apple Silicon 上运行。提供鼠须管输入方案、本地候选对照页面、后台服务和可回退的安装脚本。

默认使用改进后的 lime 语境词组生成；Laya 为可切换的实验功能。两者都离线运行。

这是 0.1 系列的实验性桌面版本。候选选择仍会出错；请阅读 [测试与已知限制](docs/VALIDATION.md)。

## macOS 快速安装

需要 Apple Silicon Mac、macOS 14 或更新版本、Git、Apple 命令行开发工具，以及鼠须管。首次安装需要联网下载约 1 GB 模型，以及运行依赖；建议预留至少 3 GB 磁盘空间。之后推理全部在本机完成。

已有鼠须管和 `uv` 的用户可以直接执行：

```bash
git clone https://github.com/yzxoi/lime-jev.git
cd lime-jev
./lime-jev install
```

尚未准备环境时，使用 [Homebrew](https://brew.sh/) 安装：

```bash
brew install git uv deno
brew install --cask squirrel
xcode-select --install
```

如果已安装 Xcode 或命令行工具，无需重复运行最后一条命令。首次安装鼠须管后，在 **系统设置 → 键盘 → 文本输入 → 编辑** 中添加鼠须管；macOS 可能要求注销后重新登录。然后执行上面的项目安装命令。

安装脚本会下载固定版本并校验 SHA-256、准备 Python 环境、安装独立的 Rime 方案、备份涉及的配置、创建登录时启动的用户服务，并打开本地控制页。若没有全局 Deno，但有 npm，会在项目内安装 Deno 2.9.6。网络失败后可以重新运行，下载支持断点续传。

在鼠须管中按 **Control + `** 打开方案菜单，选择 **Lime · 本地语境**。先输入并确认前面的文字，再继续输入全拼。例如先上屏“汽车”，再输入 `youxiang`。

## 设置为改进后的 lime（推荐）

需要同时选择正确的**鼠须管方案**和**候选策略**。只在网页关闭 Laya，不会把正在使用的薄荷或其他 Rime 方案自动切换成本项目。

1. 在 macOS 菜单栏的输入菜单中选择 **鼠须管 / Squirrel**。在一个可输入文字的地方按 **Control + `**（反引号），选择 **Lime · 本地语境**，方案 ID 为 `lime_jev`。原来的薄荷（`rime_mint`）和上游 lime 的 `llm` 方案都不是这个方案。
2. 在项目目录运行下面的命令，将候选策略设为改进后的 lime。如果服务已运行，无需再次执行 `start`。

   ```bash
   ./lime-jev start
   ./lime-jev use lime
   ./lime-jev status
   ```

   `use lime` 会立即保存并应用设置，重启服务后仍然有效，不需要重新下载模型。该命令只切换候选策略；鼠须管方案按第 1 步选择。

3. 也可以运行 `./lime-jev open`，在页面底部的 **输入法的候选策略** 中选择 **lime 语境词组（推荐）**。页面设置与命令行设置作用相同，同时影响本项目的鼠须管方案。
4. 确认 `status` 显示 `Candidate strategy: lime 语境词组（推荐，Laya 重排已关闭）`，并检查 `Rime remembered schema: lime_jev`。后者是鼠须管保存的方案记录，不能代替当前应用中的实际输入检查。

**`"backend": "off"` 表示关闭额外的 Laya 重排，改进后的 lime 仍然启用。** 本地 Qwen 模型、上下文评分、多 token 词组搜索和逐键缓存都会继续运行。即使状态中 Laya worker 显示 `ready: true`，也只表示它已加载；`backend: off` 时不会让它选择候选。

验证方法：在同一个输入框里，先用本方案输入 `qiche` 并选择“汽车”上屏，再输入 `youxiang`，应看到“油箱”优先。清空文字和语境后，输入并上屏“我现在”，再输入 `youxiang`，应看到“又想”优先。请用输入法实际输入前文；直接粘贴的文字不会自动进入当前语境。网页测试则可以直接填入前文。

如果方案菜单里找不到“Lime · 本地语境”，运行 `./lime-jev install-rime` 重新部署，然后再次打开方案菜单。若当前不是中文模式，按 Shift 切回中文。同一应用内点击切换输入框后，按 **Control + Shift + Backspace** 清空旧语境。

已经安装 v0.1.0 的用户若没有 `use` 命令，可以先 `git pull --ff-only` 更新 main 分支，或直接用上述网页方式设置。若检出的是发布标签、处于 detached HEAD，则先 `git switch main` 再更新。

## 使用

```bash
./lime-jev open       # 打开本地控制页，比较上下文与候选
./lime-jev use lime   # 改进后的 lime，关闭额外的 Laya 重排（推荐）
./lime-jev use laya   # 开启 Laya 实验重排
./lime-jev status     # 查看模型及输入法部署状态
./lime-jev stop       # 停止后台服务，并取消自动启动
./lime-jev start      # 启动服务，并恢复登录时自动启动
./lime-jev restart
./lime-jev logs       # 查看启动和错误日志
./lime-jev uninstall  # 移除 Rime 集成和后台服务
```

卸载保留项目内的模型与配置备份。服务运行期间请保留项目目录；需要移动目录时先 `stop`，移动后重新运行 `install`。

本地控制页默认地址为 `http://127.0.0.1:17864`。通过 `./lime-jev open` 打开时会自动携带仅本机使用的访问密钥，密钥不进入服务器 URL 日志。可在页面切换候选策略。

**清空语境：Control + Shift + Backspace。** 应用切换、常见的删除/光标移动、切换中英文模式与空闲超时都会使历史前缀失效。同一应用内用鼠标切换输入框，或外部程序修改文本时，当前版本无法可靠判断，请手动清空。

## 如何工作

```text
鼠须管全拼输入
  → lime / 本地 Qwen 生成合法拼音候选
  → 当前会话的文字前缀 + 完整拼音候选
  → 本地候选选择器
  → 将所选候选移至第一位，用户确认后上屏
```

- 对短拼音探索多 token 词组，使“油 + 箱”“又 + 想”等词组进入候选，使用上下文条件概率排序，并缓存逐键推理分支。
- 保留候选的拼音消费长度与预编辑信息，所选词移动后，其他词的相对顺序不变。
- 只在完整消费当前拼音的候选中做选择，避免将单字前缀与完整词组混排。
- 模型不可用或超过等待预算时保留改进后的 lime 顺序；lime 服务也不可用时，鼠须管使用内置 `luna_pinyin` 作为基础输入回退。
- 使用 Metal/MLX 推理，模型常驻，重复请求可从内存缓存返回。
- 输入法提供全拼；双拼及任意编辑器的完整光标周边文本同步暂未作为本版本支持项。

## 本地数据

推理服务只监听 `127.0.0.1` 的 17864 和 17865 端口，并验证本地访问密钥。启动模型服务时设置 `HF_HUB_OFFLINE=1`。前缀与重排缓存只在内存中保存，应用服务不会把输入历史写入日志。

鼠须管自己的用户词典和学习行为遵循其原有设置；本方案启用了传统回退引擎的用户词典。

模型位于 `models/`，密钥、日志、设置和 Rime 备份位于 `.runtime/`。这些目录已被 Git 忽略。应用切换辅助程序只读取应用标识，不读取窗口标题或编辑框内容，不需要辅助功能权限。

## 开发与验证

相关上游仓库在开发时克隆到 `.upstream/`，不作为子模块或发布内容；成品通过锁定的依赖与模型清单复现安装。

```bash
deno check app/server.ts
deno lint app tests
deno test -A tests key_map/pinyin/test utils/test/pinyin_in_pinyin.test.ts
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

模型诊断使用仓库内的合成样例，候选选择与实际候选召回分开测量。为避免 GPU 竞争，先停止后台服务，再依次运行：

```bash
./lime-jev stop
.venv/bin/python benchmarks/evaluate_laya.py
deno run -A benchmarks/evaluate_lime.ts --baseline
deno run -A benchmarks/evaluate_lime.ts
deno run -A benchmarks/smoke.ts
./lime-jev start
```

这些是开发诊断，不能外推为日常输入准确率。模型配置和校验和见 [scripts/models.json](scripts/models.json)，实现设计与最初调研见 [RESEARCH.md](RESEARCH.md)。

## 致谢与许可证

特别感谢 **[xushengfeng/lime](https://github.com/xushengfeng/lime)** 提供的拼音引擎、候选生成与 Rime 集成，以及 **[NandhaKishorM/laya](https://github.com/NandhaKishorM/laya)** 提供的开源多语言决策模型。也感谢 **[mizorewww/laya-mlx](https://github.com/mizorewww/laya-mlx)** 的 Apple Silicon 移植工作。

本项目保留 lime 的 Git 历史，衍生代码使用 **GPL-3.0**，见 [LICENSE](LICENSE)。依赖与模型保留各自许可证，完整来源说明见 [NOTICE.md](NOTICE.md)。

本项目是独立社区实现，与 TypeSafe 无隶属关系，不包含专有 Jev 权重，不调用 Jev 云端 API。
