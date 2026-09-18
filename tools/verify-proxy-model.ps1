# End-to-end test of the two reverse-proxy shapes against a running fork.
#
# Model B in the plan is "TLS reverse proxy that keeps the public Host header,
# with the public domain declared as a trusted host". This test replaces TLS
# with plain HTTP on loopback so the fence behaviour can be observed directly.

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Minhn\DSH_Customize'
$token = $args[0]
$origin = 'https://dsh.example.test'
$authority = 'dsh.example.test'
$problems = @()

function Invoke-ProxiedCase([string]$mode, [int]$port, [string]$hostHeader = $authority) {
  $proxy = Start-Process -FilePath 'node' -ArgumentList "$repo\tools\host-proxy.mjs", '--port', "$port", '--target', 'http://127.0.0.1:8095', '--mode', $mode `
    -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  $jar = Join-Path $env:TEMP "dsh-proxy-$mode-$port.txt"
  Remove-Item $jar -Force -ErrorAction SilentlyContinue

  # Establish a browser session through the proxy: the token exchange response
  # carries the cookie the later API call needs.
  $exchange = curl.exe -s -o NUL -D - -c $jar -H "Host: $hostHeader" "http://127.0.0.1:$port/?token=$token"
  $exchangeCode = ($exchange | Select-String -Pattern '^HTTP/[0-9.]+ (\d+)').Matches
  $exchangeStatus = if ($exchangeCode.Count -gt 0) { $exchangeCode[0].Groups[1].Value } else { '?' }

  $api = curl.exe -s -o NUL -w '%{http_code}' -b $jar -H "Host: $hostHeader" -H "Origin: https://$hostHeader" `
    -X POST -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$port/api/settings/describe"

  Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  return @{ exchange = $exchangeStatus; api = $api }
}

Write-Output 'MODEL B: reverse proxy shapes (no TLS, loopback transport)'
$preserve = Invoke-ProxiedCase 'preserve' 8093
Write-Output ("  preserve Host : token exchange -> $($preserve.exchange) (expect 303) ; API with matching Origin -> $($preserve.api) (expect 200)")
$rewrite = Invoke-ProxiedCase 'rewrite' 8094
Write-Output ("  rewrite Host  : token exchange -> $($rewrite.exchange) (expect 303 too, the redirect still works) ; API with matching Origin -> $($rewrite.api) (expect 403)")
Write-Output '  NOTE: rewrite mode therefore looks healthy until the app calls the API. The page loads, then every /api call is refused.'

Write-Output ''
Write-Output 'MODEL A: the wire shape an SSH tunnel delivers (loopback authority on another port)'
$tunnel = Invoke-ProxiedCase 'preserve' 8092 '127.0.0.1:9000'
Write-Output ("  Host 127.0.0.1:9000 : token exchange -> $($tunnel.exchange) (expect 303) ; API with matching Origin -> $($tunnel.api) (expect 200)")

if ($preserve.exchange -ne '303') { $problems += "preserve mode did not mint a session cookie (got $($preserve.exchange))" }
if ($preserve.api -ne '200') { $problems += "preserve mode API call failed (got $($preserve.api))" }
if ($rewrite.exchange -ne '303') { $problems += "rewrite mode did not even reach the redirect (got $($rewrite.exchange))" }
if ($rewrite.api -ne '403') { $problems += "rewrite mode was not refused as predicted (got $($rewrite.api))" }
if ($tunnel.exchange -ne '303') { $problems += "tunnel-shaped authority did not mint a cookie (got $($tunnel.exchange))" }
if ($tunnel.api -ne '200') { $problems += "tunnel-shaped authority could not call the API (got $($tunnel.api))" }

if ($problems.Count -gt 0) {
  Write-Output ''
  foreach ($problem in $problems) { Write-Output "FAIL: $problem" }
  exit 1
}
Write-Output ''
Write-Output 'RESULT: PASS - Model B works with a Host-preserving proxy and the browser session dies under a Host-rewriting one.'
