<#
.SYNOPSIS
    在本机注册「走走数据库每日备份」计划任务。

.DESCRIPTION
    这是 GitHub Actions 备份之外的本地兜底：只在电脑开机并登录时触发。
    注册计划任务会写入系统配置，所以这个脚本不会自动执行，需要你手动跑一次。

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1 -Time "23:30"
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1 -Unregister
#>
[CmdletBinding()]
param(
    [string]$Time = "02:00",
    [string]$TaskName = "Zouzou DB Backup",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "已删除计划任务：$TaskName"
    }
    else {
        Write-Host "没有找到计划任务：$TaskName"
    }
    return
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    throw "PATH 里找不到 node，请先安装 Node.js 或手动指定路径。"
}

if (-not (Test-Path (Join-Path $root ".env"))) {
    throw "项目根目录缺少 .env，备份脚本拿不到 DATABASE_URL：$root"
}

$action = New-ScheduledTaskAction `
    -Execute $node `
    -Argument "scripts\backup-db.mjs" `
    -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "走走：每天把 Neon 数据库逻辑导出到 backups/，保留最近 30 份。" `
    -Force | Out-Null

Write-Host "已注册计划任务：$TaskName（每天 $Time）"
Write-Host "立即试跑一次：Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "查看上次结果：Get-ScheduledTaskInfo -TaskName '$TaskName'"
