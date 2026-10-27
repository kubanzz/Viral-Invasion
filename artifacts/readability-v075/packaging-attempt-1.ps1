param([Parameter(Mandatory=$true)][string]$Workspace)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath $Workspace).Path
$package = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a numeric release version.' }
$releaseRoot = Join-Path $taskRoot 'releases'
$releaseFolder = Join-Path $releaseRoot "Viral-Invasion-G4-v$version"
$zipPath = "$releaseFolder.zip"
$verifyFolder = Join-Path $taskRoot ".tools\release-v$version-verified"
foreach ($target in @($releaseFolder, $zipPath, $verifyFolder)) {
  if (Test-Path -LiteralPath $target) { throw "Preserve existing release; target already exists: $target" }
}
$build = Get-Content -LiteralPath (Join-Path $taskRoot 'dist\build-meta.json') -Raw | ConvertFrom-Json
if ($build.version -ne $version) { throw 'Build version differs from package version.' }
New-Item -ItemType Directory -Path $releaseFolder | Out-Null
foreach ($name in @('index.html', 'game.js', 'build-meta.json')) {
  Copy-Item -LiteralPath (Join-Path $taskRoot "dist\$name") -Destination (Join-Path $releaseFolder $name)
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $releaseFolder 'Open-Game.cmd'), "@echo off`r`nstart `"`" `"%~dp0index.html`"`r`n", [System.Text.Encoding]::ASCII)
$instructions = @"
Viral Invasion / 病毒入侵 v$version

完整解压后双击 Open-Game.cmd，或用 Chrome / Edge 打开 index.html。无需网络或服务器。
WASD 移动；鼠标瞄准；左键使用工具；1 精确净化 / 2 范围裂解 / 3 组织修复；Q 扫描与免疫召集；E 交互；Space 冲刺；Esc 暂停。

战场：心脏与肺部均为 2400×1500，设施分区，跟随镜头与小地图支持路线选择。
进化：四种协议、三个槽位，每次三选一；已有协议继续升至Ⅰ/Ⅱ/Ⅲ阶。Q诊断后可在研究台定向研究，卡片展示提升与使用方式。
协同：Q 空装召一只短时侦巡；免疫灯塔强化为三体小队，实际移动、绕障和接触咬击。搭配显影可优先围猎，搭配共振与连锁可改变清群方式。
本版：统一战场文字避让，合并小队标注，压缩HUD重复信息，短窗口保留感染失控倒计时，危机连线与警示绘制在前景效果之后。

先清感染源，阻断增援；保护组织并处理变异与迁移。母巢净化、所有激活器官完整度≥50%、感染<35%后，靠近终端按E主动复测获胜。
首玩理解、趣味和复玩意愿仍需要真人试玩记录；本包属于技术候选。
"@
[System.IO.File]::WriteAllText((Join-Path $releaseFolder 'README.txt'), $instructions, $utf8)
$names = @('index.html', 'game.js', 'build-meta.json', 'Open-Game.cmd', 'README.txt')
$releaseFiles = @($names | ForEach-Object { Join-Path $releaseFolder $_ })
Compress-Archive -LiteralPath $releaseFiles -DestinationPath $zipPath -CompressionLevel Optimal
Expand-Archive -LiteralPath $zipPath -DestinationPath $verifyFolder
$entries = @()
foreach ($name in $names) {
  $packaged = Get-FileHash -LiteralPath (Join-Path $releaseFolder $name) -Algorithm SHA256
  $unpacked = Get-FileHash -LiteralPath (Join-Path $verifyFolder $name) -Algorithm SHA256
  if ($packaged.Hash -ne $unpacked.Hash) { throw "Unpacked bytes differ: $name" }
  $entries += @{name=$name;sha256=$packaged.Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $packaged.Path).Length}
}
$zipHash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
$report = @{version=$version;zip=$zipPath;bytes=(Get-Item -LiteralPath $zipPath).Length;sha256=$zipHash.Hash.ToLowerInvariant();verifiedFolder=$verifyFolder;files=$entries;staticPass=$true}
$reportPath = Join-Path $taskRoot "artifacts\readability-v075\release-package.json"
[System.IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 8), $utf8)
$report | ConvertTo-Json -Depth 8
