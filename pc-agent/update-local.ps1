# Upgrade only the app and instructions; preserve secrets, tools and downloads.
$ErrorActionPreference = 'Stop'
$AgentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = [IO.Path]::GetFullPath('C:\ydownauto')
$SourceRoot = Join-Path $AgentRoot 'dist'
$AgentPath = Join-Path $InstallRoot 'ydown.exe'
$EnvPath = Join-Path $InstallRoot '.env'
if (!(Test-Path -LiteralPath $AgentPath) -or !(Test-Path -LiteralPath $EnvPath)) {
    throw 'Existing C:\ydownauto installation with .env is required.'
}
$Files = @('ydown.exe', '.env.example', 'start-ydown.cmd', 'install-startup.ps1', 'uninstall-startup.ps1', 'SETUP_GUIDE_KO.md', 'search.sql')
foreach ($Name in $Files) {
    if (!(Test-Path -LiteralPath (Join-Path $SourceRoot $Name))) { throw "Missing build output: $Name" }
}
# Refuse an upgrade while media processing is active; no download is interrupted.
if (Get-Process -Name 'yt-dlp','ffmpeg','ffprobe' -ErrorAction SilentlyContinue) {
    throw 'Media processing is active. Wait for downloads to finish, then retry.'
}
$EnvHash = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash
$BackupRoot = Join-Path $InstallRoot ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $BackupRoot | Out-Null
foreach ($Name in $Files) {
    $Existing = Join-Path $InstallRoot $Name
    if (Test-Path -LiteralPath $Existing) { Copy-Item -LiteralPath $Existing -Destination (Join-Path $BackupRoot $Name) }
}
$Running = @(Get-Process -Name ydown -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $AgentPath })
foreach ($Process in $Running) { Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue }
foreach ($Process in $Running) { Wait-Process -Id $Process.Id -Timeout 15 -ErrorAction SilentlyContinue }
try {
    foreach ($Name in $Files) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot $Name) -Destination (Join-Path $InstallRoot $Name) -Force
    }
    if ((Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash -ne $EnvHash) { throw '.env changed unexpectedly.' }
    if ((Get-FileHash -LiteralPath $AgentPath).Hash -ne (Get-FileHash -LiteralPath (Join-Path $SourceRoot 'ydown.exe')).Hash) { throw 'Executable verification failed.' }
} catch {
    Copy-Item -LiteralPath (Join-Path $BackupRoot 'ydown.exe') -Destination $AgentPath -Force
    if ($Running.Count) { Start-Process -FilePath $AgentPath -WorkingDirectory $InstallRoot -WindowStyle Hidden }
    throw
}
Start-Process -FilePath $AgentPath -WorkingDirectory $InstallRoot -WindowStyle Hidden
Write-Output "Updated $AgentPath; .env preserved; previous files backed up to $BackupRoot"
