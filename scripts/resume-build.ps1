<#
.SYNOPSIS
  Resume the M2-M5 parallel build with headless Claude Code, waiting out usage limits.

.DESCRIPTION
  For each milestone (m2..m5) whose checklist in docs/build/<m>.md still has unticked boxes:
    1. Make sure its git worktree (../nt-<m>) exists on its branch.
    2. Run `claude -p` in that worktree with a prompt to continue from the checklist.
    3. If the run hits a usage or rate limit, sleep and try again. Repeat until the checklist
       is complete or MaxAttempts is reached.
  Milestones run in parallel as background jobs. Logs go to logs/build/.
  Integration (merging the branches) is NOT automatic. Pass -Integrate to run it at the end. It
  merges and verifies locally, and never pushes or touches the hosted database.

.EXAMPLE
  pwsh scripts/resume-build.ps1                    # resume every unfinished milestone
  pwsh scripts/resume-build.ps1 -Milestones m3,m4  # only these
  pwsh scripts/resume-build.ps1 -Integrate         # resume, then integrate locally
#>
param(
  [string[]]$Milestones = @("m2", "m3", "m4", "m5"),
  [int]$LimitWaitMinutes = 30,
  [int]$MaxAttempts = 24,
  [switch]$Integrate,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Parent = Split-Path $Repo -Parent
$BaseBranch = "feat/m2-m5"
$Branches = @{
  m2 = "feat/m2-neurolab"; m3 = "feat/m3-behaviourlab"; m4 = "feat/m4-research"; m5 = "feat/m5-hardening"
}
$LogDir = Join-Path $Repo "logs/build"
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Get-Worktree([string]$m) { Join-Path $Parent "nt-$m" }

function Get-Remaining([string]$m) {
  $brief = Join-Path (Get-Worktree $m) "docs/build/$m.md"
  if (-not (Test-Path $brief)) { $brief = Join-Path $Repo "docs/build/$m.md" }
  @(Select-String -Path $brief -Pattern '^\s*- \[ \]' -ErrorAction SilentlyContinue).Count
}

function Ensure-Worktree([string]$m) {
  $wt = Get-Worktree $m
  if (Test-Path $wt) { return }
  $branch = $Branches[$m]
  git -C $Repo show-ref --verify --quiet "refs/heads/$branch"
  if ($LASTEXITCODE -eq 0) { git -C $Repo worktree add $wt $branch }
  else { git -C $Repo worktree add -b $branch $wt $BaseBranch }
  foreach ($f in @(".env.local", "api/.env")) {
    $src = Join-Path $Repo $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $wt $f) }
  }
}

$pending = @($Milestones | Where-Object { (Get-Remaining $_) -gt 0 })
Write-Host "Unfinished milestones: $($pending -join ', ')"
if ($DryRun) { foreach ($m in $pending) { Write-Host "  $m : $(Get-Remaining $m) boxes left" }; return }

$jobs = foreach ($m in $pending) {
  Ensure-Worktree $m
  Start-Job -Name "build-$m" -ArgumentList $m, (Get-Worktree $m), $LogDir, $LimitWaitMinutes, $MaxAttempts -ScriptBlock {
    param($m, $wt, $LogDir, $LimitWaitMinutes, $MaxAttempts)
    $prompt = @"
You are resuming milestone $m of the NeuroTrack M2-M5 parallel build. You are in its git worktree.
Read docs/build/STATUS.md (rules) and docs/build/$m.md (your brief and checklist). Check git log
and git status to see what is already done. Then continue with the first unticked items, ticking
each box in the same commit as its work. Follow every rule in STATUS.md: stay in your files,
never push, never run supabase db push, never run pnpm e2e. Before you stop, make sure the checks
pass, everything is committed, and the Notes section is up to date.
"@
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
      $brief = Join-Path $wt "docs/build/$m.md"
      $left = @(Select-String -Path $brief -Pattern '^\s*- \[ \]').Count
      if ($left -eq 0) { "[$m] checklist complete"; return }
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $log = Join-Path $LogDir "$m-$stamp.log"
      "[$m] attempt $attempt, $left boxes left, log: $log"
      Push-Location $wt
      try { $out = & claude -p $prompt --permission-mode auto --output-format json 2>&1 | Out-String }
      finally { Pop-Location }
      $out | Set-Content -Encoding utf8 $log
      if ($out -match '(?i)usage limit|rate limit|limit reached|limit will reset|resets at|overloaded|429') {
        "[$m] hit a usage/rate limit; sleeping $LimitWaitMinutes min"
        Start-Sleep -Seconds ($LimitWaitMinutes * 60)
      }
    }
    "[$m] stopped after $MaxAttempts attempts; check logs"
  }
}

if ($jobs) {
  while (@($jobs | Where-Object { $_.State -eq "Running" }).Count -gt 0) {
    $jobs | Receive-Job | ForEach-Object { Write-Host $_ }
    Start-Sleep -Seconds 30
  }
  $jobs | Receive-Job | ForEach-Object { Write-Host $_ }
  $jobs | Remove-Job
}

$left = @($Milestones | Where-Object { (Get-Remaining $_) -gt 0 })
if ($left.Count -gt 0) { Write-Host "Still unfinished: $($left -join ', '). Re-run this script."; exit 1 }
Write-Host "All milestone checklists complete."

if ($Integrate) {
  $prompt = @"
Integrate the NeuroTrack M2-M5 build locally, following docs/build/STATUS.md (Integration).
On branch $BaseBranch, merge feat/m2-neurolab, feat/m3-behaviourlab, feat/m4-research and
feat/m5-hardening one at a time. Resolve conflicts; for api/openapi.json and
src/lib/api/schema.d.ts, run pnpm api:types again instead of hand-merging. Update the dashboard
module statuses, README roadmap and CLAUDE.md layout table. Run pnpm lint, typecheck, test and
build, plus the api ruff and pytest checks, and fix any failures. Commit. Do NOT push, do NOT run
supabase db push, and do NOT open a PR. Leave those for a human-reviewed session.
"@
  Push-Location $Repo
  try {
    git checkout $BaseBranch
    & claude -p $prompt --permission-mode auto --output-format json 2>&1 |
      Set-Content -Encoding utf8 (Join-Path $LogDir "integrate-$(Get-Date -Format yyyyMMdd-HHmmss).log")
  } finally { Pop-Location }
}
