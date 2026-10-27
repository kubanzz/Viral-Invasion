# v0.8.7 冻结源码复现

本次补充当前发行输入的独立安装、构建、测试与开发启动证据，不修改游戏玩法或发行包。原设计依据为开发验收文档的执行规则8、AC-M00-02及RUN-01。

## 源码交付与范围

源码包：[Viral-Invasion-SourceCandidate-v0.8.7.zip](../releases/Viral-Invasion-SourceCandidate-v0.8.7.zip)。共452个文件，源码与既有本地资源72,002,557字节；压缩包64,287,505字节，SHA256：`4ffb9e500354574cf6436ba8ddec2196d01470b0bcef58febb429a23f1794560`。

它冻结了发行时的完整工作区输入，包括当前依赖配置、源码、测试、必要历史测试fixture及既有资源候选集合。没有复制`node_modules`、`dist`、`.art-generated`、Git元数据或目录链接；资源由本地快照重新生成。本轮没有创建或修改美术资产。

这是**冻结工作区快照复现**，不能据此声称纯Git HEAD可独立构建。当前HEAD仍有其他会话的在途依赖、资源与表现改动，均未代为提交。源码包与可玩包用途不同；直接试玩继续使用[Viral-Invasion-G4-v0.8.7.zip](../releases/Viral-Invasion-G4-v0.8.7.zip)。

## 验证方式与当前状态

源码包使用Python标准库ZIP写入与独立解压，检查CRC和全部冻结文件指纹，再在系统临时目录安装独立依赖。显式设置`VI_ART_SOURCE`为不存在的隔离路径，避免同机默认上游目录掩盖独立性；实际生成记录为`local-snapshot`。esbuild、Vitest、Phaser、sharp、Vite均解析到该副本的`node_modules`。

- 独立`npm ci --no-audit --no-fund`通过。
- 独立`npm run build`通过；`game.js`、`index.html`和`build-meta.json`均与当前发行逐字节相同，142项构建输入全部一致。
- 完整`npm test`通过：98个文件、921项测试、0失败、0跳过，包含一个1000种子完整战役批次；批次为1000胜、0状态不变量失败。该批次是重复复现证据，不算新增1000个独特玩法种子。
- 实际PTY执行`npm run dev -- --port 5197 --strictPort`，HTTP返回200且含Vite客户端和源码入口；输入`q`并回车后正常退出0，随后端口连接被拒绝，确认服务已关闭。
- 全部452项冻结源码与142项构建输入在测试前后保持一致，主工作区游戏产物及可玩ZIP没有变化。

第一次构建因本机工具提供的`npm.cmd`使用错误的相对目录而在嵌套`npm run typecheck`前退出1；原始失败保存在`attempt-1`。随后只增加指向绝对Node/npm CLI的临时启动器，在同一份已独立安装、未修改的源码快照继续执行，结果另存`continuation-1`。没有覆盖首轮失败、重新安装依赖或更换源码。

最终[资格汇总](../artifacts/reproduction-v087/verification-summary.json)通过全部13项检查。原始目录：[初次安装与失败](../artifacts/reproduction-v087/attempt-1/summary.json)、[同快照续测](../artifacts/reproduction-v087/continuation-1/summary.json)、[独立ZIP校验](../artifacts/reproduction-v087/independent-archive-review.json)。续测报告原样保留`awaiting-dev`状态，后来完成的实际dev证据由最终汇总闭合，没有回写早期结果。独立完整会话批次只证明源码复现，不增加独特种子、真人参与者或趣味通过数。

## 在另一台电脑复现

安装Node.js及随附npm后，完整解压源码包，在该目录执行以下PowerShell命令。实测工具版本为Node.js 24.19.0、npm 11.6.2；具体命令保留在原始安装报告中。

```powershell
$env:VI_ART_SOURCE = Join-Path (Get-Location) '__unavailable_upstream__'
if (Test-Path -LiteralPath $env:VI_ART_SOURCE) { throw '请选择不存在的上游隔离路径' }
npm ci
npm run build
npm test -- --maxWorkers=2
npm run dev
```

依赖安装可使用npm缓存或正常软件源；发行游戏本身仍离线运行。开发服务器启动后访问其本地地址，退出用Vite终端的`q`再按回车。

本记录不补造新玩家观察。标准盲测仍0/5；首玩理解、节奏、成长体感、实际策略变化、自发复玩及孵化价值继续等待真实体验证据。
