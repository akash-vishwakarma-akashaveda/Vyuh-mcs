param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("alarm-manager", "bff", "command-gateway", "dead-letter-monitor", "frame-ingest", "gap-replay", "simulator", "tdae", "tfpe", "tppp", "upe", "utfe", "vyuh-mcs")]
    [string]$Engine
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bin = Join-Path $root "bin\$Engine.exe"

if (-not (Test-Path $bin)) {
    Write-Host "Binary not found at $bin. Building now..." -ForegroundColor Yellow
    $env:Path = "C:\Users\akash\go_sdk\go\bin;" + $env:Path
    $env:GOTOOLCHAIN = "local"
    go build -o $bin (Join-Path $root "cmd\$Engine")
}

Write-Host "Starting VYUH-MCS [$Engine]..." -ForegroundColor Green
& $bin
