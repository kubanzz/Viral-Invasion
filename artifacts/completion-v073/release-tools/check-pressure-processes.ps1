$ErrorActionPreference = 'Stop'
$matches = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction Stop | Where-Object {
    ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'measure-campaign-performance|release-tools[/\\]run-pressure|playwright|vitest') -or
    ($_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -match 'remote-debugging-pipe|playwright_chromiumdev_profile')
})
$report = [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); method = 'Read-only Win32_Process name and command-line filter'; relatedProcessCount = $matches.Count; processes = @($matches | Select-Object Name,ProcessId,CommandLine) }
$reportPath = Join-Path (Get-Location) 'artifacts/completion-v073/performance/attempt-1/process-review.json'
if (Test-Path -LiteralPath $reportPath) { throw 'Preserve historical process review output.' }
$json = $report | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($reportPath,$json,[System.Text.UTF8Encoding]::new($false))
$json
