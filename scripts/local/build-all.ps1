# Build all 13 VYUH-MCS modules
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$binDir = Join-Path $root "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }

$env:Path = "C:\Users\akash\go_sdk\go\bin;" + $env:Path
$env:GOTOOLCHAIN = "local"

$services = @(
    "alarm-manager", "bff", "command-gateway", "dead-letter-monitor",
    "frame-ingest", "gap-replay", "simulator", "tdae", "tfpe",
    "tppp", "upe", "utfe", "vyuh-mcs"
)

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  🔨 Compiling All 13 VYUH-MCS Engine Binaries" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

foreach ($svc in $services) {
    Write-Host "  -> Compiling $svc..." -ForegroundColor Yellow
    go build -o (Join-Path $binDir "$svc.exe") (Join-Path $root "cmd\$svc")
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build $svc"
        exit 1
    }
}

Write-Host "`n[✓] All 13 binaries successfully compiled into $binDir" -ForegroundColor Green
