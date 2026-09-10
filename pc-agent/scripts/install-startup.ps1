param(
    [string]$TaskName = "YDown Agent"
)

$AgentRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $AgentRoot "run-agent.cmd"

if (-not (Test-Path -LiteralPath $Runner)) {
    throw "run-agent.cmd를 찾을 수 없습니다: $Runner"
}

$Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument "/c `"$Runner`"" -WorkingDirectory $AgentRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Vercel YDown 작업을 이 PC에서 다운로드합니다." -Force
Start-ScheduledTask -TaskName $TaskName
Write-Host "설치 완료: $TaskName"
