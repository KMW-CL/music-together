$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'launch.ps1'
$icon = Join-Path $projectRoot 'public\app-dev-v6.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Music Together.lnk'

if (-not (Test-Path $icon)) { throw "Icon file is missing: $icon" }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = $icon
$shortcut.Description = 'Start Music Together and open the music room'
$shortcut.Save()
Write-Output $shortcutPath
