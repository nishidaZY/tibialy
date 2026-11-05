# Windows half of install.sh: copies the launcher and icon, then creates the Desktop shortcut.
param(
  [Parameter(Mandatory)][string]$Distro,
  [Parameter(Mandatory)][string]$Repo
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$dest = Join-Path $env:USERPROFILE 'TIBIALY'
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'TIBIALY.vbs') $dest -Force
Copy-Item (Join-Path $PSScriptRoot '..\..\desktop\build\icon.ico') (Join-Path $dest 'TIBIALY.ico') -Force

$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TIBIALY.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"{0}" "{1}" "{2}"' -f (Join-Path $dest 'TIBIALY.vbs'), $Distro, $Repo
$shortcut.WorkingDirectory = $dest
$shortcut.IconLocation = (Join-Path $dest 'TIBIALY.ico') + ',0'
$shortcut.Description = 'TIBIALY'
$shortcut.Save()

Write-Output "Shortcut created: $link"
