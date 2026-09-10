$ErrorActionPreference = "Stop"
$AgentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $AgentRoot

try {
    python -m PyInstaller --version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller가 설치되어 있지 않습니다. 먼저 'python -m pip install pyinstaller'를 실행하세요."
    }

    python -m PyInstaller --clean --noconfirm ydown.spec
    if ($LASTEXITCODE -ne 0) {
        throw "ydown.exe 빌드에 실패했습니다."
    }

    $Output = Join-Path $AgentRoot "dist\ydown.exe"
    Copy-Item -LiteralPath (Join-Path $AgentRoot ".env.example") -Destination (Join-Path $AgentRoot "dist\.env.example") -Force
    Copy-Item -LiteralPath (Join-Path $AgentRoot "start-ydown.cmd") -Destination (Join-Path $AgentRoot "dist\start-ydown.cmd") -Force
    Copy-Item -LiteralPath (Join-Path $AgentRoot "scripts\install-startup.ps1") -Destination (Join-Path $AgentRoot "dist\install-startup.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $AgentRoot "scripts\uninstall-startup.ps1") -Destination (Join-Path $AgentRoot "dist\uninstall-startup.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $AgentRoot "..\SETUP_GUIDE_KO.md") -Destination (Join-Path $AgentRoot "dist\SETUP_GUIDE_KO.md") -Force
    Write-Host "빌드 완료: $Output"
} finally {
    Pop-Location
}
