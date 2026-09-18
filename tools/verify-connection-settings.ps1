# Live verification of the connection settings section.
#
# Proves, against the running server and without a restart, that a committed
# settings change reaches the Host/Origin fence, the minted cookie lifetime,
# and the signing-secret rotation.

$ErrorActionPreference = 'Stop'
$home_ = 'C:\Users\Minhn\DSH_Customize\.dsh-dev'
$settings = Join-Path $home_ 'settings.yaml'
$token = $args[0]
$jar1 = Join-Path $env:TEMP 'dsh-t1.txt'
$jar2 = Join-Path $env:TEMP 'dsh-t2.txt'
$base = 'http://127.0.0.1:8090'

function Get-MaxAge([string]$jar) {
  $headers = curl.exe -s -o NUL -D - -c $jar "$base/?token=$token"
  $match = ($headers | Select-String -Pattern 'Max-Age=(\d+)').Matches
  if ($match.Count -eq 0) { return '(no cookie)' }
  return $match[0].Groups[1].Value
}

function Get-ApiCode([string]$jar, [string]$hostHeader) {
  $argv = @('-s', '-o', 'NUL', '-w', '%{http_code}')
  if ($jar) { $argv += @('-b', $jar) }
  if ($hostHeader) { $argv += @('-H', "Host: $hostHeader") }
  $argv += @('-X', 'POST', '-H', 'content-type: application/json', '-d', '{}', "$base/api/settings/describe")
  return (curl.exe @argv)
}

function Get-SettingsText { return (Get-Content $settings -Raw) }

function Set-ConnectionSection([string]$block) {
  # Remove the existing top-level `connection:` block by LINE, not by a greedy
  # regex: with (?s) a trailing `.*` swallows every following section.
  $kept = New-Object System.Collections.Generic.List[string]
  $skipping = $false
  foreach ($line in (Get-Content $settings)) {
    if ($line -match '^[A-Za-z][A-Za-z0-9._-]*:') { $skipping = $line -match '^connection:' }
    if (-not $skipping) { $kept.Add($line) }
  }
  $temp = "$settings.tmp"
  Set-Content -Path $temp -Value (($kept -join "`n").TrimEnd() + "`n" + $block) -Encoding UTF8 -NoNewline
  Move-Item -Path $temp -Destination $settings -Force
}

Write-Output "1) baseline cookie Max-Age          : $(Get-MaxAge $jar1)  (expect 2592000 = 30 days)"
Write-Output "2) baseline Host: example.test      : $(Get-ApiCode $null 'example.test')  (expect 403 = fence refused)"
Write-Output "3) baseline Host: 127.0.0.1:8090 no cookie: $(Get-ApiCode $null $null)  (expect 401)"

Set-ConnectionSection @"
connection:
  cookieMaxAgeDays: 1
  trustedHosts:
    - example.test
"@
Start-Sleep -Milliseconds 1500

Write-Output ''
Write-Output "4) after cookieMaxAgeDays=1         : $(Get-MaxAge $jar2)  (expect 86400 = 1 day, LIVE)"
Write-Output "5) after trustedHosts=[example.test]: $(Get-ApiCode $null 'example.test')  (expect 401 = fence passed, auth missing)"
Write-Output "6) api with valid cookie            : $(Get-ApiCode $jar2 $null)  (expect 200)"

Set-ConnectionSection @"
connection:
  cookieMaxAgeDays: 1
  trustedHosts:
    - example.test
  revokeBrowserSessions: true
"@
Start-Sleep -Milliseconds 1500

Write-Output ''
Write-Output "7) after revokeBrowserSessions=true : $(Get-ApiCode $jar2 $null)  (expect 401 = old cookie invalidated)"
Write-Output ''
Write-Output '8) settings.yaml connection section after honor:'
(Get-SettingsText) -split "`n" | Select-String -Pattern '^connection:' -Context 0,5 | ForEach-Object { $_.Line; $_.Context.PostContext }
