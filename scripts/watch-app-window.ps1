param([Parameter(Mandatory = $true)][int]$ServerId, [Parameter(Mandatory = $true)][int]$Port)
$ErrorActionPreference = 'Stop'

# Chromium can reuse an existing process, so monitor windows rather than the
# process returned by Start-Process.
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class MusicAppWindows {
    private delegate bool Callback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    public static int Count(int port) {
        int count = 0;
        EnumWindows((hwnd, data) => {
            if (!IsWindowVisible(hwnd)) return true;
            var text = new StringBuilder(256);
            GetWindowText(hwnd, text, text.Capacity);
            string title = text.ToString();
            if (!title.EndsWith(" [Music Together " + port + "]")) return true;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            try {
                string name = Process.GetProcessById((int)pid).ProcessName;
                if (name == "msedge" || name == "chrome") count++;
            } catch (ArgumentException) { }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
'@

$started = [DateTime]::UtcNow
$lastSeen = $null
while (Get-Process -Id $ServerId -ErrorAction SilentlyContinue) {
  if ([MusicAppWindows]::Count($Port) -gt 0) { $lastSeen = [DateTime]::UtcNow }
  $idle = if ($lastSeen) { ([DateTime]::UtcNow - $lastSeen).TotalSeconds } else { ([DateTime]::UtcNow - $started).TotalSeconds }
  # Allow for browser startup, short reloads and another app launch.
  if ($idle -gt $(if ($lastSeen) { 5 } else { 45 })) {
    Stop-Process -Id $ServerId -ErrorAction SilentlyContinue
    break
  }
  Start-Sleep -Seconds 1
}
