$ErrorActionPreference = "Stop"
$ConfigPath = Join-Path $env:ProgramData "TimeWatcher\agent.json"
if (-not (Test-Path $ConfigPath)) { exit 2 }
$Config = Get-Content $ConfigPath | ConvertFrom-Json
$Device = $env:COMPUTERNAME
$Now = [DateTime]::UtcNow.ToString("o")
$Payload = @{
  bucket = @{ id = "timewatcher-window_$Device"; type = "currentwindow"; client = "timewatcher-windows"; hostname = $Device; data = @{} }
  events = @(@{ timestamp = $Now; duration = 60; data = @{ app = "Windows"; title = "Sessão ativa" } })
} | ConvertTo-Json -Depth 6
$Headers = @{ Authorization = "Bearer $($Config.token)" }
Invoke-RestMethod -Method Post -Uri "$($Config.server_url)/ingest/v1/activity-events" -Headers $Headers -ContentType "application/json" -Body $Payload
