# GEN7 Cameo relay — forwards request files to the local CameoMCPBridge (127.0.0.1:18740) and writes the responses back.
# Why: the Cameo bridge listens only on this PC's loopback; the GEN7 MBSE agent runs in the Claude workspace VM,
# which shares this folder but cannot open 127.0.0.1 on Windows. Nothing else is reachable through this relay.
# Stop: Ctrl+C in this window, or create a file named STOP in the queue folder.
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$queue = Join-Path $root 'queue'
$base  = 'http://127.0.0.1:18740/api/v1'
$utf8  = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force -Path $queue | Out-Null
Write-Host "GEN7 Cameo relay  ->  $base"
Write-Host "Queue: $queue   (Ctrl+C or a STOP file to end)"
while ($true) {
  if (Test-Path (Join-Path $queue 'STOP')) { Write-Host 'STOP file found, exiting.'; break }
  $reqs = Get-ChildItem -Path $queue -Filter '*.req.json' -ErrorAction SilentlyContinue | Sort-Object Name
  foreach ($f in $reqs) {
    $id = $f.Name -replace '\.req\.json$',''
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $status = 0; $text = ''
    try {
      # The shared folder can expose a file before it has finished syncing: retry the read for up to 2 s.
      $raw = $null
      for ($i = 0; $i -lt 40 -and $null -eq $raw; $i++) {
        try { $raw = [IO.File]::ReadAllText($f.FullName, $utf8) } catch { Start-Sleep -Milliseconds 50 }
      }
      if ($null -eq $raw) { throw ('Could not find file or file is being used by another process: ' + $f.Name) }
      $req = $raw | ConvertFrom-Json
      $path = [string]$req.path
      if (-not $path.StartsWith('/')) { throw 'path must start with /' }
      $url = $base + $path
      if ($req.query) { $url += '?' + [string]$req.query }
      $timeout = 120; if ($req.timeoutSec) { $timeout = [int]$req.timeoutSec }
      $params = @{ Uri = $url; Method = [string]$req.method; UseBasicParsing = $true; TimeoutSec = $timeout }
      if ($null -ne $req.body) { $params.Body = $utf8.GetBytes([string]$req.body); $params.ContentType = 'application/json; charset=utf-8' }
      $r = Invoke-WebRequest @params
      $status = [int]$r.StatusCode
      $text = $utf8.GetString($r.RawContentStream.ToArray())
    } catch [System.Net.WebException] {
      $resp = $_.Exception.Response
      if ($resp) { $status = [int]$resp.StatusCode; $sr = New-Object IO.StreamReader($resp.GetResponseStream(), $utf8); $text = $sr.ReadToEnd() }
      else { $status = -1; $text = $_.Exception.Message }
    } catch { $status = -1; $text = $_.Exception.Message }
    $sw.Stop()
    $out = @{ id = $id; status = $status; ms = $sw.ElapsedMilliseconds; body = $text } | ConvertTo-Json -Depth 3 -Compress
    $tmp = Join-Path $queue ($id + '.res.tmp')
    [IO.File]::WriteAllText($tmp, $out, $utf8)
    Move-Item -Force $tmp (Join-Path $queue ($id + '.res.json'))
    for ($i = 0; $i -lt 40; $i++) { try { Remove-Item -Force $f.FullName -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 50 } }
    Write-Host ("{0}  {1,-6} {2,-48} {3,4}  {4,6} ms" -f (Get-Date -Format 'HH:mm:ss'), $req.method, $req.path, $status, $sw.ElapsedMilliseconds)
  }
  # Responses are consumed within seconds; the agent side cannot delete files in this folder, so clean up here.
  if ((Get-Date).Second % 15 -eq 0) {
    Get-ChildItem -Path $queue -Filter '*.res.json' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-2) } | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 40
}
