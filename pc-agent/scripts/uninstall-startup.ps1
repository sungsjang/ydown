param(
    [string]$TaskName = "YDown Agent"
)

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $Task) {
    Write-Host "등록된 작업이 없습니다: $TaskName"
    exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "자동 실행 제거 완료: $TaskName"
