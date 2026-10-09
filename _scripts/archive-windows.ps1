param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskBuildRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'build')) + [IO.Path]::DirectorySeparatorChar
$taskSourcePath = [IO.Path]::GetFullPath($Source)
$taskOutputPath = [IO.Path]::GetFullPath($Output)
if (-not $taskSourcePath.StartsWith($taskBuildRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive source must be inside this project build folder.' }
if (-not $taskOutputPath.StartsWith($taskBuildRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive output must be inside this project build folder.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskSourcePath 'Media.exe') -PathType Leaf)) { throw 'The portable app is missing Media.exe.' }
Compress-Archive -LiteralPath $taskSourcePath -DestinationPath $taskOutputPath -CompressionLevel Optimal -Force
