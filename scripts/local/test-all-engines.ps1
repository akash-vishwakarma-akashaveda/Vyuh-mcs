# Automated Verification & Integration Test Suite for all VYUH-MCS Engines

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  🧪 Running Full Live Integration Tests for all Engines" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan

$passCount = 0
$failCount = 0

function Assert-Test {
    param (
        [string]$Name,
        [bool]$Condition,
        [string]$Details = ""
    )
    if ($Condition) {
        Write-Host "  [PASS] $Name" -ForegroundColor Green
        $script:passCount++
    } else {
        Write-Host "  [FAIL] $Name - $Details" -ForegroundColor Red
        $script:failCount++
    }
}

# 1. Test BFF Health Check
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8085/health" -Method Get -TimeoutSec 3
    Assert-Test "BFF Health Endpoint (:8085/health)" ($health.status -eq "ok")
} catch {
    Assert-Test "BFF Health Endpoint (:8085/health)" $false $_.Exception.Message
}

# 2. Test BFF Satellites List & SCID 42
try {
    $sats = Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/satellites" -Method Get -TimeoutSec 3
    Assert-Test "BFF Satellites List (:8085/api/v1/satellites)" ($sats.satellites.Count -ge 2)
    
    $sat42 = Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/satellites/42" -Method Get -TimeoutSec 3
    Assert-Test "BFF Satellite Config (:8085/api/v1/satellites/42)" ($sat42.scid -eq 42 -and $sat42.name -eq "VYUH-042")
} catch {
    Assert-Test "BFF Satellites Endpoint" $false $_.Exception.Message
}

# 3. Test BFF Telemetry Current (CVT)
try {
    $cvt = Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/telemetry/42/current" -Method Get -TimeoutSec 3
    Assert-Test "BFF CVT Live Value (:8085/api/v1/telemetry/42/current)" ($cvt.scid -eq 42 -and $cvt.params.BUS_VOLTAGE.value -gt 0)
} catch {
    Assert-Test "BFF CVT Endpoint" $false $_.Exception.Message
}

# 4. Test BFF Telemetry History
try {
    $hist = Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/telemetry/42/OBC_TEMP/history" -Method Get -TimeoutSec 3
    Assert-Test "BFF Telemetry History (:8085/api/v1/telemetry/42/OBC_TEMP/history)" ($hist.data.Count -gt 0)
} catch {
    Assert-Test "BFF History Endpoint" $false $_.Exception.Message
}

# 5. Test BFF Alarm Acknowledgment
try {
    $ackRes = Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/alarms/alm-sys-01/acknowledge" -Method Post -TimeoutSec 3
    Assert-Test "BFF Alarm Acknowledgment" ($ackRes.status -eq "ACKNOWLEDGED")
} catch {
    Assert-Test "BFF Alarm Acknowledgment" $false $_.Exception.Message
}

# 6. Test Command Gateway (:8080) - Submit Valid Command (Uplink -> UPE -> UTFE -> COP-1)
$cmdId = $null
try {
    $cmdBody = @{
        scid = 42
        apid = 100
        priority = "HIGH"
        params = @{
            heater_power = 75.0
        }
    } | ConvertTo-Json

    $cmdResp = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands" -Method Post -Body $cmdBody -ContentType "application/json" -TimeoutSec 3
    $cmdId = $cmdResp.commandId
    Assert-Test "Command Gateway Ingress (POST :8080/api/v1/commands)" ($cmdResp.status -eq "PENDING" -and $cmdId -ne $null)
} catch {
    Assert-Test "Command Gateway Ingress" $false $_.Exception.Message
}

# 7. Test Command Gateway - Query Submitted Command
if ($cmdId) {
    try {
        $getCmd = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands/$cmdId" -Method Get -TimeoutSec 3
        Assert-Test "Command Tracking Query (GET :8080/api/v1/commands/$cmdId)" ($getCmd.commandId -eq $cmdId)
    } catch {
        Assert-Test "Command Tracking Query" $false $_.Exception.Message
    }
}

# 8. Test Command Gateway - Cancel / Lifecycle (Already dispatched -> 409 Conflict or 200 Cancelled)
try {
    $cancelBody = @{ scid = 42; apid = 100 } | ConvertTo-Json
    $toCancel = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands" -Method Post -Body $cancelBody -ContentType "application/json"
    $cancelResp = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands/$($toCancel.commandId)/cancel" -Method Post
    Assert-Test "Command Lifecycle (:8080/api/v1/commands/{id}/cancel)" ($cancelResp.status -eq "CANCELLED")
} catch {
    # If the uplink pipeline already dispatched it to SENT/ACKNOWLEDGED, Gateway correctly returns 409 Conflict
    $is409 = ($_.Exception.Response.StatusCode -eq 409)
    Assert-Test "Command Lifecycle (FR-CMDGW-010 Conflict on Dispatched)" $is409
}

# 9. Test Command Gateway - Validation Check (Missing SCID/APID)
try {
    $invalidBody = "{}"
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands" -Method Post -Body $invalidBody -ContentType "application/json"
    Assert-Test "Command Validation (Reject invalid schema)" $false "Expected 400 Bad Request"
} catch {
    Assert-Test "Command Validation (Reject invalid schema)" ($_.Exception.Response.StatusCode -eq 400)
}

# 10. Test Frame Ingest Antenna Port (:5050 TCP)
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect("127.0.0.1", 5050)
    $connected = $tcpClient.Connected
    $tcpClient.Close()
    Assert-Test "Frame Ingest Antenna TCP Port (:5050)" $connected
} catch {
    Assert-Test "Frame Ingest Antenna TCP Port (:5050)" $false $_.Exception.Message
}

# 11. Test Telemetry WebSocket Stream (:8088/ws/telemetry)
try {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $uri = New-Object System.Uri("ws://127.0.0.1:8088/ws/telemetry")
    $ws.ConnectAsync($uri, $cts.Token).Wait(2000) | Out-Null
    $wsOpen = ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open)
    if ($wsOpen) {
        $buffer = New-Object byte[] 4096
        $seg = New-Object System.ArraySegment[byte] -ArgumentList @($buffer, 0, 4096)
        $res = $ws.ReceiveAsync($seg, $cts.Token)
        $res.Wait(3000) | Out-Null
        $rawMsg = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $res.Result.Count)
        $json = $rawMsg | ConvertFrom-Json
        $received = ($json.type -eq "PARAM_UPDATE" -and $json.scid -eq 42)
        Assert-Test "TDAE WebSocket Live Telemetry (:8088/ws/telemetry -> PARAM_UPDATE)" $received "Got: $rawMsg"
        try { $ws.Dispose() } catch {}
    } else {
        Assert-Test "TDAE WebSocket Live Telemetry (:8088/ws/telemetry)" $false "WebSocket not open"
    }
} catch {
    Assert-Test "TDAE WebSocket Live Telemetry (:8088/ws/telemetry)" $false $_.Exception.Message
}

# 12. Test Frontend UI Dev Server (:3000)
try {
    $uiResp = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 3
    Assert-Test "React Frontend UI Server (:3000)" ($uiResp.StatusCode -eq 200)
} catch {
    Assert-Test "React Frontend UI Server (:3000)" $false $_.Exception.Message
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Test Summary: $passCount PASSED, $failCount FAILED" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================" -ForegroundColor Cyan
