$ErrorActionPreference = "Continue"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TimeWatcherNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
}
"@

function Get-Context {
  $handle = [TimeWatcherNative]::GetForegroundWindow()
  $title = New-Object System.Text.StringBuilder 1024
  [void][TimeWatcherNative]::GetWindowText($handle, $title, $title.Capacity)
  $processId = 0
  [void][TimeWatcherNative]::GetWindowThreadProcessId($handle, [ref]$processId)
  $app = "Windows"
  try { $app = (Get-Process -Id $processId).ProcessName } catch {}
  return @{ app = $app; title = $title.ToString() }
}

function Get-IdleSeconds {
  $info = New-Object TimeWatcherNative+LASTINPUTINFO
  $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
  if ([TimeWatcherNative]::GetLastInputInfo([ref]$info)) { return [Math]::Max(0, ([Environment]::TickCount64 - $info.dwTime) / 1000) }
  return 0
}

$settings = Get-ItemProperty "HKLM:\Software\TimeWatcher" -ErrorAction SilentlyContinue
if (-not $settings.ServerUrl -or -not $settings.EnrollmentToken) { exit 2 }
$headers = @{ Authorization = "Bearer $($settings.EnrollmentToken)" }
$device = $env:COMPUTERNAME

while ($true) {
  try {
    $now = [DateTime]::UtcNow.ToString("o")
    $context = Get-Context
    $idle = Get-IdleSeconds
    $windowPayload = @{
      bucket = @{ id = "timewatcher-window_$device"; type = "currentwindow"; client = "timewatcher-windows"; hostname = $device; data = @{ tenantId = $settings.TenantId } }
      events = @(@{ timestamp = $now; duration = 60; data = $context })
    } | ConvertTo-Json -Depth 6
    $afkPayload = @{
      bucket = @{ id = "timewatcher-afk_$device"; type = "afkstatus"; client = "timewatcher-windows"; hostname = $device; data = @{ tenantId = $settings.TenantId } }
      events = @(@{ timestamp = $now; duration = 60; data = @{ status = $(if ($idle -ge 300) { "afk" } else { "not-afk" }) } })
    } | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/activity-events" -Headers $headers -ContentType "application/json" -Body $windowPayload | Out-Null
    Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/activity-events" -Headers $headers -ContentType "application/json" -Body $afkPayload | Out-Null
  } catch {}
  Start-Sleep -Seconds 60
}
