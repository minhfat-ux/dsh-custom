# Verify the Host/Origin fence and cookie-authority binding against a running
# fork, for the two access models: an SSH tunnel onto loopback (A) and a
# TLS reverse proxy that preserves the public Host header (B).

$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8095'
$token = $args[0]
$jar = Join-Path $env:TEMP 'dsh-fence.txt'

function Get-Code([string[]]$headers) {
  $argv = @('-s', '-o', 'NUL', '-w', '%{http_code}')
  foreach ($line in $headers) { $argv += @('-H', $line) }
  $argv += @('-X', 'POST', '-H', 'content-type: application/json', '-d', '{}', "$base/api/settings/describe")
  return (curl.exe @argv)
}

function Exchange-Cookie([string]$authority) {
  $result = curl.exe -s -o NUL -D - -c $jar -H "Host: $authority" "$base/?token=$token"
  $line = ($result | Select-String -Pattern 'set-cookie: (dsh-auth-[^=]+)=').Matches
  if ($line.Count -eq 0) { return '(no cookie)' }
  return $line[0].Groups[1].Value
}

Write-Output 'FENCE: Host/Origin decisions'
Write-Output ("  a) Host 127.0.0.1:9999, loopback but another port   -> " + (Get-Code @('Host: 127.0.0.1:9999')) + '  (expect 401: a tunnel port is still loopback)')
Write-Output ("  b) Host 127.0.0.1:8095 + foreign Origin             -> " + (Get-Code @('Host: 127.0.0.1:8095', 'Origin: https://dsh.example.test')) + '  (expect 403: the nginx-style Host rewrite failure)')
Write-Output ("  c) Host dsh.example.test + matching Origin          -> " + (Get-Code @('Host: dsh.example.test', 'Origin: https://dsh.example.test')) + '  (expect 401 once trusted, else 403)')
Write-Output ("  d) Host dsh.example.test + cross-site marker        -> " + (Get-Code @('Host: dsh.example.test', 'Origin: https://dsh.example.test', 'sec-fetch-site: cross-site')) + '  (expect 403)')

Write-Output ''
Write-Output 'COOKIE: authority binding'
$cookie9999 = Exchange-Cookie '127.0.0.1:9999'
$cookie8095 = Exchange-Cookie '127.0.0.1:8095'
Write-Output ("  cookie minted for 127.0.0.1:9999 : $cookie9999")
Write-Output ("  cookie minted for 127.0.0.1:8095 : $cookie8095")
Write-Output ("  names differ                     : " + ($cookie9999 -ne $cookie8095 -and $cookie9999 -ne '(no cookie)'))
