import { execFileSync } from 'node:child_process';

export const protectQaWindow = processId => {
  if (process.platform !== 'win32') return;
  if (!Number.isSafeInteger(processId) || processId < 1) throw new Error('Invalid QA process.');
  const script = 'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public static class MediaQaWindow{[DllImport("user32.dll")]public static extern bool EnableWindow(IntPtr window,bool enabled);[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);}\';$qaProcess=[Diagnostics.Process]::GetProcessById(' + processId + ');$qaProcess.Refresh();$qaWindow=$qaProcess.MainWindowHandle;if($qaWindow -eq [IntPtr]::Zero){throw \'QA window is unavailable\'};[MediaQaWindow]::EnableWindow($qaWindow,$false)|Out-Null;[MediaQaWindow]::SetWindowPos($qaWindow,[IntPtr]1,0,0,0,0,19)|Out-Null';
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
};
