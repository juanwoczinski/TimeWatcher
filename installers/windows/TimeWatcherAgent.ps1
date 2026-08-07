$ErrorActionPreference = "Continue"

$LogDirectory = Join-Path $env:ProgramData "TimeWatcher"
$LogPath = Join-Path $LogDirectory "agent.log"
function Write-AgentLog([string]$Message) {
  try {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    "$(Get-Date -Format o) $Message" | Add-Content -Path $LogPath -Encoding UTF8
  } catch {}
}

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
if (-not $settings.ServerUrl -or (-not $settings.EnrollmentToken -and -not $settings.AgentToken)) {
  Write-AgentLog "ERRO configuracao ausente: reinstale usando o pacote vinculado ao tenant."
  exit 2
}
$mutex = $null
try {
  $mutex = New-Object System.Threading.Mutex($false, "Global\\TimeWatcherAgent")
  if (-not $mutex.WaitOne(0, $false)) { Write-AgentLog "Instancia ja em execucao."; exit 0 }
} catch {}
$device = $env:COMPUTERNAME
$AgentVersion = "0.4.2"
$agentToken = [string]$settings.AgentToken
if (-not $agentToken) {
  try {
    Write-AgentLog "Registrando credencial permanente do dispositivo..."
    $enrollmentHeaders = @{ Authorization = "Bearer $($settings.EnrollmentToken)" }
    $enrollmentBody = @{ host = $device; platform = "windows" } | ConvertTo-Json
    $enrollment = Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/agent-enroll" -Headers $enrollmentHeaders -ContentType "application/json" -Body $enrollmentBody
    $agentToken = [string]$enrollment.agentToken
    $tenantId = [string]$enrollment.tenantId
    if (-not $agentToken) { throw "Servidor nao retornou a credencial do agente" }
    if (-not $tenantId) { throw "Servidor nao retornou a empresa do agente" }
    New-Item -Path "HKLM:\Software\TimeWatcher" -Force | Out-Null
    New-ItemProperty -Path "HKLM:\Software\TimeWatcher" -Name "AgentToken" -Value $agentToken -PropertyType String -Force | Out-Null
    New-ItemProperty -Path "HKLM:\Software\TimeWatcher" -Name "TenantId" -Value $tenantId -PropertyType String -Force | Out-Null
    $settings = Get-ItemProperty "HKLM:\Software\TimeWatcher" -ErrorAction Stop
    Write-AgentLog "Credencial permanente registrada."
  } catch {
    Write-AgentLog "ERRO no provisionamento: $($_.Exception.Message)"
    exit 3
  }
}
$headers = @{ Authorization = "Bearer $agentToken" }
$UpdateStatePath = Join-Path $env:ProgramData "TimeWatcher\update-state.json"
$LastUpdateCheck = [DateTime]::MinValue

function Set-UpdateState([string]$Status, [string]$TargetVersion = "", [string]$ErrorMessage = "") {
  $directory = Split-Path $UpdateStatePath
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  @{ status = $Status; targetVersion = $TargetVersion; checkedAt = [DateTime]::UtcNow.ToString("o"); error = $ErrorMessage } | ConvertTo-Json | Set-Content -Path $UpdateStatePath -Encoding UTF8
}

function Get-UpdateState {
  try { return Get-Content $UpdateStatePath -Raw | ConvertFrom-Json } catch { return @{ status = "current"; targetVersion = $AgentVersion; error = "" } }
}

function Test-AgentUpdate {
  if (([DateTime]::UtcNow - $script:LastUpdateCheck).TotalMinutes -lt 15) { return }
  $script:LastUpdateCheck = [DateTime]::UtcNow
  try {
    Set-UpdateState "checking" $AgentVersion
    $query = "host=$([Uri]::EscapeDataString($device))&platform=windows&version=$([Uri]::EscapeDataString($AgentVersion))"
    $manifest = Invoke-RestMethod -Method Get -Uri "$($settings.ServerUrl)/ingest/v1/agent-update?$query" -Headers $headers
    if (-not $manifest.updateAvailable -or -not $manifest.release) { Set-UpdateState "current" $AgentVersion; return }
    $release = $manifest.release
    if (-not ([string]$release.url).StartsWith("https://") -or ([string]$release.sha256).Length -ne 64) { throw "Manifesto de atualização inválido" }
    $target = [string]$release.version; Set-UpdateState "downloading" $target
    $download = Join-Path $env:TEMP "TimeWatcher-$target.msi"
    Invoke-WebRequest -Uri $release.url -OutFile $download -UseBasicParsing
    $actual = (Get-FileHash -Path $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne ([string]$release.sha256).ToLowerInvariant()) { throw "Checksum SHA-256 não confere" }
    Set-UpdateState "installing" $target
    $process = Start-Process msiexec.exe -ArgumentList "/i `"$download`" /qn /norestart" -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010, 1641)) { throw "MSI retornou código $($process.ExitCode)" }
    Set-UpdateState "installed" $target
    $scriptPath = Join-Path $PSScriptRoot "TimeWatcherAgent.ps1"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Start-Sleep 5; & '$scriptPath'`""
    exit 0
  } catch {
    $status = if ($_.Exception.Message -match "denied|negado|elevation|privil") { "permission_required" } else { "failed" }
    Set-UpdateState $status "" $_.Exception.Message
  }
}

function Get-DeviceInventory {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
  $bios = Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue
  $software = @()
  try {
    $software = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { $_.DisplayName } | Sort-Object -Unique | Select-Object -First 300
  } catch {}
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1 -ExpandProperty IPAddress)
  return @{ os = "Windows"; osVersion = $(if ($os) { $os.Caption } else { "" }); model = $(if ($cs) { "$($cs.Manufacturer) $($cs.Model)" } else { "" }); architecture = $env:PROCESSOR_ARCHITECTURE; memoryGB = $(if ($cs) { [Math]::Round($cs.TotalPhysicalMemory / 1GB, 1).ToString() } else { "" }); localIp = $ip; sessionUser = $env:USERNAME; sessionEmail = $settings.UserEmail; serial = $(if ($bios) { $bios.SerialNumber } else { "" }); installedSoftware = @($software) }
}

while ($true) {
  try {
    Test-AgentUpdate
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
    $heartbeatPayload = @{
      bucket = @{ id = "timewatcher-heartbeat_$device"; type = "timewatcher.heartbeat"; client = "timewatcher-windows/$AgentVersion"; hostname = $device; data = @{ tenantId = $settings.TenantId } }
      events = @(@{ timestamp = $now; duration = 0; data = @{ version = $AgentVersion; platform = "Windows"; device = (Get-DeviceInventory); update = (Get-UpdateState) } })
    } | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/activity-events" -Headers $headers -ContentType "application/json" -Body $windowPayload | Out-Null
    Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/activity-events" -Headers $headers -ContentType "application/json" -Body $afkPayload | Out-Null
    Invoke-RestMethod -Method Post -Uri "$($settings.ServerUrl)/ingest/v1/activity-events" -Headers $headers -ContentType "application/json" -Body $heartbeatPayload | Out-Null
    Write-AgentLog "Heartbeat enviado para $device."
  } catch {
    Write-AgentLog "ERRO de envio: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 60
}
