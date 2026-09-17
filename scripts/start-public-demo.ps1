param(
  [switch]$Reset
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# 失效守卫（2026-09-17 加）
#
# 这个脚本来自 SQLite 单机阶段，现在整条路都是坏的：
#
#   1. 它把 DATABASE_URL 设成 "file:./public-demo.db"。数据库早已迁到 Neon
#      Postgres（schema provider = "postgresql"），Prisma 会直接拒绝这个连接串：
#      "the URL must start with the protocol postgresql:// or postgres://"
#      —— 实测确认，任何碰数据库的请求都会失败。
#
#   2. 它设置 APP_ACCESS_PASSWORD，但整个 src/ 里没有任何代码读取这个变量，
#      也没有 middleware。所谓"访问密码"从来没有生效过，实例实际上是公开的。
#
#   合起来就是：跑一次就会把一台连不上库、且没有访问密码的实例挂到公网隧道上。
#   与其让它继续悄悄这么做，不如直接拦住。
#
#   现在对外分享/验收统一用正式域名 https://nextstep9.work（见 docs/deploy-edgeone.md）。
#   如果确实要重建公开演示实例，请先改成连接 PostgreSQL、补上真正的访问控制，
#   再删掉这段守卫。
# ---------------------------------------------------------------------------
$stopMessage = @"
scripts/start-public-demo.ps1 已失效，未执行任何操作。

原因：
  1. 数据库已迁移到 PostgreSQL，脚本里的 DATABASE_URL="file:./public-demo.db"
     会被 Prisma 直接拒绝（连接串必须以 postgresql:// 开头）。
  2. 脚本设置的 APP_ACCESS_PASSWORD 在应用代码里没有任何地方读取，
     这个"访问密码"从来没有生效过。

继续跑这个脚本，只会把一台连不上数据库、且没有访问密码的实例挂到公网隧道上。

现在对外分享请使用正式域名：https://nextstep9.work
部署方式见：docs/deploy-edgeone.md
"@
Write-Host $stopMessage -ForegroundColor Red
exit 1

$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$node = Join-Path $runtimeRoot "node\bin\node.exe"
$nodeBin = Join-Path $runtimeRoot "node\bin"
$cloudflared = Join-Path $root "tools\cloudflared.exe"
$logDir = Join-Path $root ".public-demo"
$serverOut = Join-Path $logDir "server.out.log"
$serverErr = Join-Path $logDir "server.err.log"
$tunnelOut = Join-Path $logDir "tunnel.out.log"
$tunnelErr = Join-Path $logDir "tunnel.err.log"
$restartLog = Join-Path $logDir "restart.log"
$tunnelUrlFile = Join-Path $logDir "tunnel.url"
$demoDb = Join-Path $root "prisma\public-demo.db"
$demoPassword = if ($env:PUBLIC_DEMO_PASSWORD) { $env:PUBLIC_DEMO_PASSWORD } else { "123456" }
$demoPort = 3001
$env:AI_QUOTA_ENABLED = if ($env:AI_QUOTA_ENABLED) { $env:AI_QUOTA_ENABLED } else { "true" }
$env:AI_QUOTA_DAILY_CALLS = if ($env:AI_QUOTA_DAILY_CALLS) { $env:AI_QUOTA_DAILY_CALLS } else { "200" }
$env:AI_QUOTA_DAILY_TOKENS = if ($env:AI_QUOTA_DAILY_TOKENS) { $env:AI_QUOTA_DAILY_TOKENS } else { "100000" }
$env:AI_QUOTA_VISITOR_DAILY_CALLS = if ($env:AI_QUOTA_VISITOR_DAILY_CALLS) { $env:AI_QUOTA_VISITOR_DAILY_CALLS } else { "10" }
$env:AI_QUOTA_VISITOR_DAILY_TOKENS = if ($env:AI_QUOTA_VISITOR_DAILY_TOKENS) { $env:AI_QUOTA_VISITOR_DAILY_TOKENS } else { "20000" }

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Is-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Ensure-DemoDatabase {
  if ($Reset -and (Test-Path -LiteralPath $demoDb)) {
    Remove-Item -LiteralPath $demoDb -Force
  }

  $isNew = -not (Test-Path -LiteralPath $demoDb)
  if ($isNew) {
    New-Item -ItemType File -Path $demoDb -Force | Out-Null
  }

  $env:DATABASE_URL = "file:./public-demo.db"
  & $node (Join-Path $root "node_modules\prisma\build\index.js") db push --skip-generate
  if ($LASTEXITCODE -ne 0) {
    throw "demo database sync failed"
  }

  if ($isNew) {
    & $node (Join-Path $root "scripts\seed-demo-data.mjs") --force
    if ($LASTEXITCODE -ne 0) {
      throw "demo database seed failed"
    }
  }
}

function Ensure-DemoServer {
  if (Is-PortListening -Port $demoPort) {
    return
  }

  $env:PATH = $nodeBin + ";" + $env:PATH
  $env:DATABASE_URL = "file:./public-demo.db"
  $env:APP_ACCESS_PASSWORD = $demoPassword

  Start-Process -FilePath $node `
    -ArgumentList @(
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "0.0.0.0",
      "-p",
      $demoPort
    ) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr

  for ($index = 0; $index -lt 30; $index += 1) {
    Start-Sleep -Seconds 1
    if (Is-PortListening -Port $demoPort) {
      return
    }
  }

  throw "demo server did not start on port $demoPort"
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

function Ensure-Tunnel {
  if (-not (Test-Path -LiteralPath $cloudflared)) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) cloudflared not found"
    return $null
  }

  try {
    $process = Start-Process -FilePath $cloudflared `
      -ArgumentList @(
        "tunnel",
        "--url",
        "http://localhost:$demoPort",
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

Ensure-DemoDatabase
Ensure-DemoServer
$tunnelProcess = Ensure-Tunnel
$loopCount = 0

while ($true) {
  Start-Sleep -Seconds 10
  $loopCount += 1

  if (-not (Is-PortListening -Port $demoPort)) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) restarting demo server"
    Ensure-DemoServer
  }

  $tunnelAlive = $null
  if ($tunnelProcess) {
    $tunnelAlive = Get-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue
  }

  if (-not $tunnelAlive) {
    Add-Content -Path $restartLog -Value "$(Get-Date -Format o) restarting demo tunnel"
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
        Add-Content -Path $restartLog -Value "$(Get-Date -Format o) demo tunnel unreachable, restarting"
        Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
        $tunnelProcess = Ensure-Tunnel
      }
    }
  }
}
