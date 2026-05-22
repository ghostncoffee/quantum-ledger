# start.ps1 — Game Ledger dev launcher
# Opens the API server in a new window, then runs Vite here.
# Usage: .\start.ps1

$Root = $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# Resolve absolute paths upfront so spaces are never a problem
$tsx    = Join-Path $Root "server\node_modules\tsx\dist\cli.mjs"
$entry  = Join-Path $Root "server\src\index.ts"
$vite   = Join-Path $Root "client\node_modules\vite\bin\vite.js"

Step "Game Ledger — starting dev environment"

# ── 1. Skip if server already running on :3001 ────────────────────────────────
$alreadyUp = $false
try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", 3001)
    $c.Close()
    $alreadyUp = $true
    Write-Host "   Port 3001 already in use — skipping server launch" -ForegroundColor Yellow
} catch { }

if (-not $alreadyUp) {
    # ── 2. Start API server — node gets two separate args, no shell quoting ───
    Step "Starting API server (new window)"
    Start-Process node -ArgumentList "`"$tsx`"", "`"$entry`"" -WorkingDirectory $Root

    # ── 3. Poll :3001 until ready (max 15 s) ─────────────────────────────────
    Write-Host "   Waiting for API" -NoNewline -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        Write-Host "." -NoNewline -ForegroundColor DarkGray
        try {
            $c = New-Object System.Net.Sockets.TcpClient
            $c.Connect("127.0.0.1", 3001)
            $c.Close()
            $ready = $true
            break
        } catch { }
    }

    if ($ready) { Write-Host " ready!"                              -ForegroundColor Green  }
    else         { Write-Host " timed out — starting client anyway" -ForegroundColor Yellow }
}

# ── 4. Run Vite in this window ────────────────────────────────────────────────
Step "Vite → http://localhost:5173"
Write-Host "   (Close the server window separately when done)`n" -ForegroundColor DarkGray
& node $vite
