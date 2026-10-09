$ErrorActionPreference = 'Stop'
$carterRoot = Split-Path -Parent $PSScriptRoot
$carterExecutable = Join-Path $carterRoot 'build\win-unpacked\CarterTube.exe'
if (-not (Test-Path -LiteralPath $carterExecutable)) {
  throw 'Build CarterTube before creating its shortcut.'
}

# Copy only portable library databases into a separate profile on first setup.
$carterProfile = Join-Path $env:APPDATA 'CarterTube'
$freetubeProfile = Join-Path $env:APPDATA 'FreeTube'
$carterDatabase = Join-Path $carterProfile 'settings.db'
if (-not (Test-Path -LiteralPath $carterDatabase)) {
  New-Item -ItemType Directory -Path $carterProfile -Force | Out-Null
  foreach ($database in @('settings', 'history', 'profiles', 'playlists', 'search-history', 'subscription-cache')) {
    $source = Join-Path $freetubeProfile "$database.db"
    $target = Join-Path $carterProfile "$database.db"
    if ((Test-Path -LiteralPath $source) -and -not (Test-Path -LiteralPath $target)) {
      Copy-Item -LiteralPath $source -Destination $target
    }
  }
  # The redesign starts on For you; video, privacy and library preferences remain.
  $defaults = @(
    @{_id = 'baseTheme'; value = 'dark'},
    @{_id = 'landingPage'; value = 'home'},
    @{_id = 'expandSideBar'; value = $true},
    @{_id = 'checkForUpdates'; value = $false}
  )
  $lines = @('') + @($defaults | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress })
  Add-Content -LiteralPath $carterDatabase -Value $lines -Encoding utf8
}

$desktopFolder = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopFolder 'CarterTube.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $carterExecutable
$shortcut.WorkingDirectory = Split-Path -Parent $carterExecutable
$shortcut.IconLocation = "$carterExecutable,0"
$shortcut.Description = 'CarterTube — private video player'
$shortcut.Save()
Write-Output "CarterTube shortcut created: $shortcutPath"
Write-Output "CarterTube profile: $carterProfile"
