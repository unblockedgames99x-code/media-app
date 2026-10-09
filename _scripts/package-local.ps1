$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNative = Join-Path $taskRoot 'packages\player\src-tauri\target\release\player.exe'
$taskEngine = Join-Path $taskRoot 'engines\cartertube\build\win-unpacked'
$taskPackage = Join-Path $taskRoot 'build\CarterMedia'
if (-not (Test-Path -LiteralPath $taskNative -PathType Leaf)) { throw 'Build the CarterMedia music shell first.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskEngine 'CarterMedia Video.exe') -PathType Leaf)) { throw 'Build the CarterMedia video engine first.' }
New-Item -ItemType Directory -Path $taskPackage -Force | Out-Null
Copy-Item -LiteralPath $taskNative -Destination (Join-Path $taskPackage 'CarterMedia.exe') -Force
$taskVideoDestination = Join-Path $taskPackage 'video-engine'
New-Item -ItemType Directory -Path $taskVideoDestination -Force | Out-Null
Get-ChildItem -LiteralPath $taskEngine -Force | Copy-Item -Destination $taskVideoDestination -Recurse -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination (Join-Path $taskPackage 'LICENSE-Nuclear.txt') -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'engines\cartertube\LICENSE') -Destination (Join-Path $taskPackage 'LICENSE-FreeTube.txt') -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'licenses') -Destination $taskPackage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'CARTERMEDIA.md') -Destination (Join-Path $taskPackage 'CARTERMEDIA.md') -Force
Write-Output (Join-Path $taskPackage 'CarterMedia.exe')
