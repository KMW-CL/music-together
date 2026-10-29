$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { $env:PORT } else { '3003' }

function Show-LaunchError([string]$message) {
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.Popup($message, 0, 'Music Together', 0x10)
}

function Test-MusicServer([string]$origin) {
  try {
    $result = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 1
    return $result.app -eq 'music-together'
  } catch { }
  # A server started before the health endpoint was added can still be reused.
  try {
    $page = Invoke-WebRequest -Uri $origin -UseBasicParsing -TimeoutSec 1
    return $page.StatusCode -eq 200 -and $page.Content.Contains('id="brandLink"') -and $page.Content.Contains('music together')
  } catch { return $false }
}

try {
  $portNumber = 0
  if (-not [int]::TryParse($port, [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) {
    throw 'PORT must be a number between 1 and 65535.'
  }
  $origin = "http://localhost:$portNumber"

  if (-not (Test-MusicServer $origin)) {
    $connection = New-Object System.Net.Sockets.TcpClient
    try {
      $pending = $connection.BeginConnect('127.0.0.1', $portNumber, $null, $null)
      if ($pending.AsyncWaitHandle.WaitOne(300)) {
        try {
          $connection.EndConnect($pending)
          throw "Port $portNumber is already used by another server. Close it or set PORT."
        } catch [System.Net.Sockets.SocketException] { }
      }
    } finally {
      $connection.Close()
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $server = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $projectRoot 'server.js') + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      if (Test-MusicServer $origin) { $ready = $true; break }
      if ($server.HasExited) { break }
      Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw "Music Together could not start on port $portNumber." }
  }

  $browserChoice = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId
  $edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
  $chrome = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
  $browser = if ($browserChoice -like '*Chrome*' -and $chrome) { $chrome } elseif ($browserChoice -like '*Edge*' -and $edge) { $edge } elseif ($edge) { $edge } else { $chrome }
  if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--app=$origin/?desktop=1"
    if ($server) {
      $watcher = Join-Path $PSScriptRoot 'watch-app-window.ps1'
      Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watcher + '" -ServerId ' + $server.Id + ' -Port ' + $portNumber) -WorkingDirectory $projectRoot -WindowStyle Hidden
    }
    if ($browser -eq $edge) {
      $iconHelper = Join-Path $PSScriptRoot 'keep-window-icon.ps1'
      Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $iconHelper + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden
    }
  } else {
    Start-Process $origin
  }
} catch {
  Show-LaunchError $_.Exception.Message
  exit 1
}
