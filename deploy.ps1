# ==============================================================================
#  PMS ONE-CLICK DEPLOYMENT ORCHESTRATOR (Windows/PowerShell)
# ==============================================================================
#  This script validates your environment, builds your images, and 
#  orchestrates the launch of the Property Management System.
# ==============================================================================

Write-Host "[START] Starting PMS Deployment Orchestrator..." -ForegroundColor Cyan

# 1. Environment Validation
if (-not (Test-Path ".env")) {
    Write-Warning "[WARN] No .env file found! Please copy .env.example to .env and fill in the secrets."
    exit 1
}

$requiredVars = @("JWT_SECRET", "DB_PASSWORD", "CLOUDINARY_API_SECRET")
foreach ($var in $requiredVars) {
    if (-not (Select-String -Path ".env" -Pattern "^$var=")) {
        Write-Error "[ERROR] Missing required secret: $var in .env!"
        exit 1
    }
}

Write-Host "[OK] Environment validation passed." -ForegroundColor Green

# 2. Docker Service Check
Write-Host "[CHECK] Checking Docker status..."
docker ps > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Docker Desktop is not running or not in PATH!"
    exit 1
}

# 3. Pull & Build
Write-Host "[BUILD] Building production assets (this may take 1-2 minutes)..." -ForegroundColor Yellow
docker compose build --pull

# 4. Launch Stack
Write-Host "[DEPLOY] Launching containers in detached mode..." -ForegroundColor Blue
docker compose up -d

# 5. Health Monitoring
Write-Host "[WAIT] Waiting for system healthchecks (Database and Redis)..." -ForegroundColor Yellow
$timeout = 60
$elapsed = 0
while ($elapsed -lt $timeout) {
    $healthy = (docker ps --filter "name=pms-backend" --filter "health=healthy" --format "{{.Names}}")
    if ($healthy) {
        Write-Host "`n[SUCCESS] All services are HEALTHY and accepting traffic!" -ForegroundColor Green
        Write-Host "Backend: http://localhost:3000/api/health"
        Write-Host "Frontend: http://localhost:5173"
        exit 0
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
    $elapsed += 2
}

Write-Error "`n[TIMEOUT] The backend did not become healthy within 60 seconds."
Write-Host "Check logs with: docker compose logs backend" -ForegroundColor Gray
exit 1
