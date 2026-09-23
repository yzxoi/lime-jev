# 在真实 Rime 引擎中复现

先安装项目并启动服务。此测试使用鼠须管自带动态库，独立临时目录中只复制本项目 schema 与 Lua，不复制个人用户词典。

```bash
git clone https://github.com/rime/librime.git .upstream/librime
git -C .upstream/librime checkout ef1a16aa2c962bccf347b116443331f39d56e037
mkdir -p .runtime/rime-smoke/build .runtime/rime-smoke/lua
cp "$HOME/Library/Rime/build/lime_jev.schema.yaml" "$HOME/Library/Rime/build/lime_jev.prism.bin" .runtime/rime-smoke/build/
cp "$HOME/Library/Rime/lua/lime_jev.lua" "$HOME/Library/Rime/lua/lime_jev_json.lua" "$HOME/Library/Rime/lua/lime_jev_config.lua" .runtime/rime-smoke/lua/
xcrun clang++ -std=c++17 benchmarks/rime_smoke.cc -I.upstream/librime/src \
  '/Library/Input Methods/Squirrel.app/Contents/Frameworks/librime.1.dylib' \
  -Wl,-rpath,'/Library/Input Methods/Squirrel.app/Contents/Frameworks' \
  -o .runtime/rime-smoke-test
.runtime/rime-smoke-test "$PWD/.runtime/rime-smoke" \
  '/Library/Input Methods/Squirrel.app/Contents/Frameworks/rime-plugins/librime-lua.dylib'
```

正常输出最后一行为 `PASS: real Rime + Lua + HTTP + model + committed prefix`。

回退验证：停止服务，再运行相同命令并添加 `--fallback` 参数；之后执行 `./lime-jev start` 恢复服务。测试时保持当前前台应用不变，避免应用切换清空正在测试的语境。

若鼠须管装在用户自己的 `~/Library/Input Methods` 下，需相应修改编译参数和测试程序中的路径。
