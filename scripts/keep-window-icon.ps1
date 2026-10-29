$ErrorActionPreference = 'Stop'
$iconPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\app-dev-v6.ico'

# Edge --app keeps its own cached window icon even after the site's favicon
# changes. Keep the HICON handles alive while the music window is open.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class MusicWindowIcon {
    private delegate bool WindowCallback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadImage(IntPtr instance, string path, uint type, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);

    public static IntPtr[] FindWindows() {
        var found = new List<IntPtr>();
        EnumWindows((hwnd, data) => {
            var text = new StringBuilder(256);
            GetWindowText(hwnd, text, text.Capacity);
            string title = text.ToString();
            if (!title.Contains("\uC11C\uB514\uBBF8 \uBBA4\uC9C1")) return true;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            try {
                if (Process.GetProcessById((int)pid).ProcessName == "msedge") found.Add(hwnd);
            } catch (ArgumentException) { }
            return true;
        }, IntPtr.Zero);
        return found.ToArray();
    }
}
'@

$created = $false
$mutex = [System.Threading.Mutex]::new($true, 'Local\MusicTogetherWindowIcon', [ref]$created)
if (-not $created) { $mutex.Dispose(); exit 0 }
try {
  $smallIcon = [MusicWindowIcon]::LoadImage([IntPtr]::Zero, $iconPath, 1, 32, 32, 0x10)
  $largeIcon = [MusicWindowIcon]::LoadImage([IntPtr]::Zero, $iconPath, 1, 256, 256, 0x10)
  if ($smallIcon -eq [IntPtr]::Zero -or $largeIcon -eq [IntPtr]::Zero) { throw "Cannot load $iconPath" }

  $started = [DateTime]::UtcNow
  $lastWindow = $null
  while ($true) {
    $windows = [MusicWindowIcon]::FindWindows()
    if ($windows.Length -gt 0) { $lastWindow = [DateTime]::UtcNow }
    foreach ($window in $windows) {
      if ([MusicWindowIcon]::SendMessage($window, 0x7f, [IntPtr]0, [IntPtr]::Zero) -ne $smallIcon) {
        [void][MusicWindowIcon]::SendMessage($window, 0x80, [IntPtr]0, $smallIcon)
      }
      if ([MusicWindowIcon]::SendMessage($window, 0x7f, [IntPtr]1, [IntPtr]::Zero) -ne $largeIcon) {
        [void][MusicWindowIcon]::SendMessage($window, 0x80, [IntPtr]1, $largeIcon)
      }
    }
    $idleSeconds = if ($lastWindow) { ([DateTime]::UtcNow - $lastWindow).TotalSeconds }
      else { ([DateTime]::UtcNow - $started).TotalSeconds }
    if ($idleSeconds -gt $(if ($lastWindow) { 15 } else { 45 })) { break }
    Start-Sleep -Milliseconds 1500
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
