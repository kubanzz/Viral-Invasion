# v0.7.3 发行与性能工具

仅为冻结包 `71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54` 准备。源码基线 `4da30026696c99b6ad936a9fcd60911cc4f59770` 逐构建输入校验；执行时的 HEAD 另记。默认检查不启动浏览器、不打包、不解压。已有同名输出一律拒绝覆盖，失败输出保留。

在仓库根目录执行（`node` 可替换为实际 Node 可执行文件）：

```text
node artifacts/completion-v073/release-tools/package.mjs --check
node artifacts/completion-v073/release-tools/verify-unpacked.mjs --check
node artifacts/completion-v073/release-tools/run-pressure.mjs --check
```

仅在根代理明确授权、全部功能/模拟浏览器终态后，执行一次独占长测：

```text
node artifacts/completion-v073/release-tools/run-pressure.mjs --run
```

默认输出 `artifacts/completion-v073/performance/attempt-1`，自动设置 `VI_PERF_POST_MEMORY=1`。若已有输出则拒绝；重试必须另给 `VI_PERF_OUTPUT` 新目录，不能拼接两次帧数组。该工具复用原压力脚本，不修改原 FPS/密度门槛或游戏规则。`--run` 本身不代替人工授权。

仅在根代理授权打包时执行：

```text
node artifacts/completion-v073/release-tools/package.mjs --package
node artifacts/completion-v073/release-tools/verify-unpacked.mjs --extract
```

五文件：`index.html`、`game.js`、`build-meta.json`、`README.txt`、`Open-Game.cmd`。生成 `releases/Viral-Invasion-G4-v0.7.3/` 和对应 ZIP，逐项 SHA/ZIP SHA/源码来源记录于 `artifacts/completion-v073/release-files.json`、`release-package-provenance.json`。ZIP 采用标准 DEFLATE/CRC32，固定成员时间为1980-01-01，仅为可复现压缩元数据。打包前校验离线 HTML 已内联 CSS；不删除未引用的 `dist/game.css`。

静态解压校验默认写到 `.tools/release-v073-verify/`，报告为 `artifacts/completion-v073/release-unpack-validation.json`，核对 ZIP CRC、五文件与清单/发行目录、前三文件与冻结 dist。它不执行任何游戏文件、不启动浏览器，不冒充离线冒烟。需要新尝试时通过 `VI_RELEASE_UNPACK_DIR` 和 `VI_RELEASE_VERIFY_OUTPUT` 指向新路径。

后续若获根代理浏览器授权，可单独对解压目录执行原 `scripts/verify-release.mjs`，显式设置新的 `VI_RELEASE_REPORT`。该步骤会启动 Chrome/Edge，不能在独占压力测量期间执行。

压力计数口径：原脚本 `cellHits` 只轮询并去重 `PROTOCOL_BEACON_HIT`，未逐条匹配正伤害 `TARGET_HIT`，不得叫作 guaranteed accepted 下界；实际正伤害用 `runMetrics.finalSummary.control.beaconBites`，含 setup/warmup。标准/低效 PNG 是不同真实状态，只证明对应快照24活体与3细胞共存，不证明全程满额或24个都在屏内可辨。`maxFrameEntries` 是读快照最大值，不是逐tick测量。原 `wallDurationMs` 在终后内存检查前赋值；wrapper `outerWallDurationMs` 才包括终后GC/10重开。帧预算通过不自动关闭完整内存或真人体验验收。
