# Authoritative port test.
#
# The URL line printed by the web-runtime row reports the composed config port,
# not the effective one, so it cannot be used to judge precedence. This starts a
# real server per case and reads the listening socket instead.

$repo = 'C:\Users\Minhn\DSH_Customize\deepseek-harness'
$env:DSH_HOME = 'C:\Users\Minhn\DSH_Customize\.dsh-dev'
$ports = 8090, 8095, 8099

function Test-Case([string]$label, [string[]]$extra) {
  $argv = @('--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open') + $extra
  $log = Join-Path $env:TEMP "dsh-port-$label.log"
  $process = Start-Process -FilePath 'node' -ArgumentList $argv -WorkingDirectory $repo `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  Start-Sleep -Seconds 15

  $listening = @()
  foreach ($port in $ports) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $listening += $port }
  }
  $url = (Get-Content $log -ErrorAction SilentlyContinue | Select-String 'dsh web:' | Select-Object -First 1).Line
  Write-Output "case $label : listening=[$($listening -join ',')]  printed: $url"

  foreach ($port in $ports) {
    $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($owner) { Stop-Process -Id $owner.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
}

Test-Case 'no-flag' @()
Test-Case 'flag-8099' @('--port', '8099')
