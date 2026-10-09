$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskExecutable = Join-Path $taskRoot 'build\CarterMedia\CarterMedia.exe'
if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { throw 'Package CarterMedia before installing the desktop shortcut.' }
& python (Join-Path $PSScriptRoot 'migrate-profile.py')
if ($LASTEXITCODE -ne 0) { throw 'Your profile could not be copied. No desktop shortcut was installed.' }
$taskDesktop = [Environment]::GetFolderPath('Desktop')
$taskShortcutPath = Join-Path $taskDesktop 'CarterMedia.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut($taskShortcutPath)
$taskShortcut.TargetPath = $taskExecutable
$taskShortcut.WorkingDirectory = Split-Path -Parent $taskExecutable
$taskShortcut.IconLocation = $taskExecutable + ',0'
$taskShortcut.Description = 'CarterMedia — music and videos'
$taskShortcut.Save()
$taskProtocol = 'HKCU:\Software\Classes\cartermedia'
New-Item -Path $taskProtocol -Force | Out-Null
Set-Item -LiteralPath $taskProtocol -Value 'URL:CarterMedia'
New-ItemProperty -LiteralPath $taskProtocol -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$taskProtocolIcon = Join-Path $taskProtocol 'DefaultIcon'
New-Item -Path $taskProtocolIcon -Force | Out-Null
Set-Item -LiteralPath $taskProtocolIcon -Value ('"' + $taskExecutable + '",0')
$taskProtocolCommand = Join-Path $taskProtocol 'shell\open\command'
New-Item -Path $taskProtocolCommand -Force | Out-Null
Set-Item -LiteralPath $taskProtocolCommand -Value ('"' + $taskExecutable + '" "%1"')
Write-Output $taskShortcutPath
