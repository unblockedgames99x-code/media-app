param([long]$WindowHandle, [string]$Output)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOutputPath = [IO.Path]::GetFullPath($Output)
if (-not $taskOutputPath.StartsWith((Join-Path $taskRoot 'qa') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'QA screenshots must stay in the CarterMedia QA folder.' }
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CarterMediaQaCapture {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rectangle);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr context, uint flags);
}
'@
$taskWindowOwner = [uint32]0
[CarterMediaQaCapture]::GetWindowThreadProcessId([IntPtr]$WindowHandle, [ref]$taskWindowOwner) | Out-Null
$taskWindowProcess = Get-Process -Id $taskWindowOwner
if (-not $taskWindowProcess.Path.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Only this CarterMedia build may be captured.' }
$taskBounds = [CarterMediaQaCapture+Rect]::new()
if (-not [CarterMediaQaCapture]::GetWindowRect([IntPtr]$WindowHandle, [ref]$taskBounds)) { throw 'Window bounds unavailable.' }
$taskBitmap = [System.Drawing.Bitmap]::new(($taskBounds.Right - $taskBounds.Left), ($taskBounds.Bottom - $taskBounds.Top))
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
$taskContext = $taskGraphics.GetHdc()
try {
    if (-not [CarterMediaQaCapture]::PrintWindow([IntPtr]$WindowHandle, $taskContext, 2)) { throw 'Window capture unavailable.' }
} finally { $taskGraphics.ReleaseHdc($taskContext) }
try { $taskBitmap.Save($taskOutputPath, [System.Drawing.Imaging.ImageFormat]::Png) }
finally { $taskGraphics.Dispose(); $taskBitmap.Dispose() }
Write-Output $taskOutputPath
