$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$node = Join-Path $runtimeRoot "node\bin\node.exe"
$nodeBin = Join-Path $runtimeRoot "node\bin"
$cloudflared = Join-Path $root "tools\cloudflared.exe"
$logDir = Join-Path $root ".public-service"
$serverOut = Join-Path $logDir "server.out.log"
$serverErr = Join-Path $logDir "server.err.log"
$tunnelOut = Join-Path $logDir "tunnel.out.log"
$tunnelErr = Join-Path $logDir "tunnel.err.log"
$restartLog = Join-Path $logDir "restart.log"
$tunnelUrlFile = Join-Path $logDir "tunnel.url"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Is-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Ensure-Server {
  if (Is-PortListening -Port 3000) {
    return
  }

  $env:PATH = $nodeBin + ";" + $env:PATH
  Start-Process -FilePath $node `
    -ArgumentList @(
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "0.0.0.0",
      "-p",
      "3000"
    ) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr

  for ($index = 0; $index -lt 30; $index += 1) {
    Start-Sleep -Seconds 1
    if (Is-PortListening -Port 3000) {
      return
    }
  }
}

function Read-TunnelUrl {
  $content = Get-Content -Path $tunnelOut -Raw -ErrorAction SilentlyContinue
  if (-not ($content -match "https://[a-z0-9-]+\.trycloudflare\.com")) {
    $content = Get-Content -Path $tunnelErr -Raw -ErrorAction SilentlyContinue
  }
  if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
    return $matches[0]
  }
  return $null
}

function Get-ExistingTunnel {
  $proc = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "localhost:3000" } |
    Select-Object -First 1
  if (-not $proc) { return $null }
  return Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
}

function Ensure-Tunnel {
  # 已有指向 3000 的隧道就复用，避免重启守护进程时更换公网地址
  $existing = Get-ExistingTunnel
  if ($existing) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) reuse tunnel pid=$($existing.Id)"
    return $existing
  }

  if (-not (Test-Path -LiteralPath $cloudflared)) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) cloudflared not found"
    return $null
  }

  try {
    $process = Start-Process -FilePath $cloudflared `
      -ArgumentList @(
        "tunnel",
        "--url",
        "http://localhost:3000",
        "--protocol",
        "http2",
        "--no-autoupdate"
      ) `
      -WorkingDirectory $root `
      -WindowStyle Hidden `
      -RedirectStandardOutput $tunnelOut `
      -RedirectStandardError $tunnelErr `
      -PassThru

    for ($index = 0; $index -lt 30; $index += 1) {
      Start-Sleep -Seconds 1
      $tunnelUrl = Read-TunnelUrl
      if ($tunnelUrl) {
        Set-Content -Path $tunnelUrlFile -Value $tunnelUrl -Encoding UTF8
        Add-Content -Path $restartLog -Value "$(Get-Date -Format o) tunnel ready $tunnelUrl"
        break
      }
    }

    return $process
  } catch {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) tunnel start failed: $($_.Exception.Message)"
    return $null
  }
}

Ensure-Server
$tunnelProcess = Ensure-Tunnel
$loopCount = 0

while ($true) {
  Start-Sleep -Seconds 10
  $loopCount += 1

  if (-not (Is-PortListening -Port 3000)) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) restarting server"
    Ensure-Server
  }

  $tunnelAlive = $null
  if ($tunnelProcess) {
    $tunnelAlive = Get-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue
  }

  if (-not $tunnelAlive) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) restarting tunnel"
    $tunnelProcess = Ensure-Tunnel
  }

  if ($loopCount % 3 -eq 0 -and $tunnelProcess) {
    $tunnelUrl = Get-Content -Path $tunnelUrlFile -Raw -ErrorAction SilentlyContinue
    if ($tunnelUrl) {
      try {
        $health = Invoke-WebRequest -Uri $tunnelUrl.Trim() -UseBasicParsing -TimeoutSec 15
        if ($health.StatusCode -ge 500) {
          throw "bad status"
        }
      } catch {
        Add-Content -Path $restartLog -Value "$(Get-Date -Format o) tunnel unreachable, restarting"
        Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
        $tunnelProcess = Ensure-Tunnel
      }
    }
  }
}
