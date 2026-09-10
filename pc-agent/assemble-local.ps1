param(
    [string]$Destination = "C:\ydownauto",
    [Parameter(Mandatory = $true)]
    [string]$ToolSource
)

$ErrorActionPreference = "Stop"
$AgentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistRoot = Join-Path $AgentRoot "dist"
$RequiredDistFiles = @("ydown.exe", ".env.example", "start-ydown.cmd", "install-startup.ps1", "uninstall-startup.ps1", "SETUP_GUIDE_KO.md")
$ToolFiles = @("yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe")

foreach ($Name in $RequiredDistFiles) {
    $Path = Join-Path $DistRoot $Name
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "빌드 결과 파일을 찾을 수 없습니다: $Path"
    }
}

foreach ($Name in $ToolFiles) {
    $Path = Join-Path $ToolSource $Name
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "필수 도구를 찾을 수 없습니다: $Path"
    }
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Destination "downloads") -Force | Out-Null

foreach ($Name in $RequiredDistFiles) {
    Copy-Item -LiteralPath (Join-Path $DistRoot $Name) -Destination (Join-Path $Destination $Name) -Force
}
foreach ($Name in $ToolFiles) {
    Copy-Item -LiteralPath (Join-Path $ToolSource $Name) -Destination (Join-Path $Destination $Name) -Force
}

$LocalEnv = Join-Path $Destination ".env"
if (-not (Test-Path -LiteralPath $LocalEnv)) {
    Copy-Item -LiteralPath (Join-Path $Destination ".env.example") -Destination $LocalEnv
}

Write-Host "YDown 1.0 로컬 폴더 준비 완료: $Destination"
Write-Host "다음 단계: 메모장으로 $LocalEnv 파일을 열고 YDOWN_API_URL과 YDOWN_AGENT_TOKEN을 입력하세요."
