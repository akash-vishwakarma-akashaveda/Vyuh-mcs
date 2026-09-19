# Run all 12 microservice engines in separate process windows
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$binDir = Join-Path $root "bin"

$engines = @(
    @{ Name = "frame-ingest";          Title = "[VYUH-MCS] Frame Ingest (:5050)" },
    @{ Name = "tfpe";                  Title = "[VYUH-MCS] TFPE (Frame Processing)" },
    @{ Name = "tppp";                  Title = "[VYUH-MCS] TPPP (Packet Processing)" },
    @{ Name = "tdae";                  Title = "[VYUH-MCS] TDAE (CVT & WS :8088)" },
    @{ Name = "command-gateway";       Title = "[VYUH-MCS] Command Gateway (:8080)" },
    @{ Name = "upe";                   Title = "[VYUH-MCS] UPE (Uplink Processing)" },
    @{ Name = "utfe";                  Title = "[VYUH-MCS] UTFE (COP-1 FOP-1)" },
    @{ Name = "bff";                   Title = "[VYUH-MCS] BFF API (:8085)" },
    @{ Name = "alarm-manager";         Title = "[VYUH-MCS] Alarm Manager" },
    @{ Name = "gap-replay";            Title = "[VYUH-MCS] Gap Replay Service" },
    @{ Name = "dead-letter-monitor";   Title = "[VYUH-MCS] Dead Letter Monitor" },
    @{ Name = "simulator";             Title = "[VYUH-MCS] Spacecraft Simulator" }
)

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  🚀 Launching all 12 VYUH-MCS Microservices Separately" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

foreach ($eng in $engines) {
    $exe = Join-Path $binDir "$($eng.Name).exe"
    if (Test-Path $exe) {
        Write-Host "  -> Starting $($eng.Title)..." -ForegroundColor Yellow
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = '$($eng.Title)'; & '$exe'"
        Start-Sleep -Milliseconds 300
    } else {
        Write-Warning "Executable not found: $exe. Run build-all.ps1 first."
    }
}

Write-Host "`nAll 12 microservice engines launched in independent console windows!" -ForegroundColor Green
Write-Host "Frontend dashboard is live at: http://localhost:3000" -ForegroundColor Cyan
