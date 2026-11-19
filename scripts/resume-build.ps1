<#
.SYNOPSIS
  Resume the sequential M2 -> M3 -> M4 -> M5 build with headless Claude Code, waiting out usage
  limits, and ship each milestone (PR, green CI, migrations, E2E, squash-merge) before the next.

.DESCRIPTION
  The script is safe to re-run at any point: it works out where each milestone stands from git,
  the checklist in docs/build/<m>.md, and the milestone's PR state on GitHub.

  For each milestone, in order:
    1. Skip it if its PR is already merged.
    2. Build: run `claude -p` in the milestone worktree (../nt-<m>) until the checklist has no
       open boxes. A run that hits a usage or rate limit sleeps, then tries again.
    3. Review: one headless independent review-and-fix pass.
    4. Rebase onto origin/main, push, and open the PR (or reuse the existing one).
    5. Wait for CI. If it fails, hand the failed log to Claude to fix, push, and wait again.
    6. Apply the milestone's migrations to the linked Supabase project (`supabase db push`).
       Skip this step with -SkipDbPush.
    7. Run Playwright E2E locally with the API running. If it fails, ask Claude to fix it and
       go back to step 4.
    8. Squash-merge the PR, then continue with the next milestone.

  Logs go to logs/build/.

.EXAMPLE
  pwsh scripts/resume-build.ps1                  # carry on from wherever things stand
  pwsh scripts/resume-build.ps1 -Milestones m4   # just one milestone
  pwsh scripts/resume-build.ps1 -NoMerge         # stop at a green PR; do not merge
  pwsh scripts/resume-build.ps1 -DryRun          # report status only
#>
param(
  [string[]]$Milestones = @("m2", "m3", "m4", "m5"),
  [int]$LimitWaitMinutes = 30,
  [int]$MaxAttempts = 24,
  [int]$MaxFixRounds = 4,
  [switch]$SkipDbPush,
  [switch]$NoMerge,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Parent = Split-Path $Repo -Parent
$ScaffoldRef = "feat/m2-m5"
$SupabaseRef = "gkztrkvslsiqafhsguel"
$Branches = @{
  m2 = "feat/m2-neurolab"; m3 = "feat/m3-behaviourlab"; m4 = "feat/m4-research"; m5 = "feat/m5-hardening"
}
$Titles = @{
  m2 = "feat: m2 neurolab"; m3 = "feat: m3 behaviourlab"; m4 = "feat: m4 research assistant"; m5 = "feat: m5 hardening and deploy-readiness"
}
$LogDir = Join-Path $Repo "logs/build"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$LimitPattern = '(?i)usage limit|rate limit|limit reached|limit will reset|resets at|overloaded|\b429\b'

function Say([string]$msg) { Write-Host "[$(Get-Date -Format HH:mm:ss)] $msg" }
function Get-Worktree([string]$m) { Join-Path $Parent "nt-$m" }

function Get-OpenBoxes([string]$m) {
  $brief = Join-Path (Get-Worktree $m) "docs/build/$m.md"
  if (-not (Test-Path $brief)) { $brief = Join-Path $Repo "docs/build/$m.md" }
  @(Select-String -Path $brief -Pattern '^\s*- \[ \]' -ErrorAction SilentlyContinue).Count
}

function Get-PrState([string]$m) {
  $json = gh pr list --repo devharunah/neurotrack --head $Branches[$m] --state all --json number,state --limit 1 2>$null
  $prs = @($json | ConvertFrom-Json)
  if ($prs.Count -eq 0) { return $null }
  return $prs[0]
}

function Ensure-Worktree([string]$m) {
  $wt = Get-Worktree $m
  if (Test-Path $wt) { return }
  $branch = $Branches[$m]
  git -C $Repo show-ref --verify --quiet "refs/heads/$branch"
  if ($LASTEXITCODE -eq 0) { git -C $Repo worktree add $wt $branch } else { git -C $Repo worktree add -b $branch $wt $ScaffoldRef }
  foreach ($f in @(".env.local", "api/.env")) {
    $src = Join-Path $Repo $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $wt $f) }
  }
}

# Runs one headless Claude session in a worktree, retrying after usage/rate limits.
function Invoke-Claude([string]$m, [string]$tag, [string]$prompt) {
  $wt = Get-Worktree $m
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    $log = Join-Path $LogDir "$m-$tag-$(Get-Date -Format yyyyMMdd-HHmmss).log"
    Say "$m ${tag}: claude session (attempt $i), log $log"
    Push-Location $wt
    try { $out = & claude -p $prompt --permission-mode auto --output-format json 2>&1 | Out-String } finally { Pop-Location }
    $out | Set-Content -Encoding utf8 $log
    if ($out -notmatch $LimitPattern) { return $out }
    Say "$m ${tag}: usage/rate limit hit; sleeping $LimitWaitMinutes min"
    Start-Sleep -Seconds ($LimitWaitMinutes * 60)
  }
  throw "$m ${tag}: still rate-limited after $MaxAttempts attempts"
}

function Build-Milestone([string]$m) {
  $prompt = @"
You are the builder for NeuroTrack milestone $m. You are in its git worktree.
Read docs/build/STATUS.md (rules) and docs/build/$m.md (your brief and checklist). Run
git log --oneline origin/main..HEAD and git status to see what is already done. Finish or discard
any half-done uncommitted work sensibly, then continue with the first unticked box. Tick each box
in the same commit as its work. Follow every rule in STATUS.md: never push, never run supabase db
push, never run pnpm e2e. Build real, working code, not stubs. Before you stop, make sure the
checks pass, everything is committed, and the Notes section is up to date.
"@
  $rounds = 0
  while ((Get-OpenBoxes $m) -gt 0) {
    if (++$rounds -gt $MaxAttempts) { throw "$m build: checklist still open after $MaxAttempts sessions" }
    Say "$m build: $(Get-OpenBoxes $m) boxes open"
    Invoke-Claude $m "build" $prompt | Out-Null
  }
  $marker = Join-Path (Get-Worktree $m) "docs/build/$m.md"
  if (-not (Select-String -Path $marker -Pattern '^### Review' -Quiet)) {
    $review = @"
You are an independent senior reviewer for NeuroTrack milestone $m. You did not write this code.
Read docs/build/STATUS.md and docs/build/$m.md, then review git diff origin/main...HEAD for:
correctness, security and privacy (RLS from an attacker's view), scientific integrity (spot-check
citations through https://api.crossref.org/works/<doi>), and checklist honesty. Run every check.
Fix CRITICAL, HIGH, and cheap MEDIUM issues as small commits. Append a "### Review" subsection to
the Notes in docs/build/$m.md and commit it. Never push.
"@
    Invoke-Claude $m "review" $review | Out-Null
  }
}

function Push-AndPr([string]$m) {
  $wt = Get-Worktree $m
  git -C $wt fetch -q origin
  if (git -C $wt status --porcelain) { git -C $wt stash push -u -m "resume-build autostash" | Out-Null }
  # Once the first milestone has merged, main already contains the scaffold commits (squashed), so
  # replay only this milestone's own commits. Before that, the scaffold has to travel with the PR.
  git -C $wt cat-file -e "origin/main:docs/build/STATUS.md" 2>$null
  if ($LASTEXITCODE -eq 0) { git -C $wt rebase --onto origin/main $ScaffoldRef 2>$null }
  else { git -C $wt rebase origin/main 2>$null }
  if ($LASTEXITCODE -ne 0) {
    git -C $wt rebase --abort 2>$null
    git -C $wt rebase origin/main
    if ($LASTEXITCODE -ne 0) {
      git -C $wt rebase --abort
      Invoke-Claude $m "rebase" "Rebase this branch onto origin/main (git fetch first), resolve every conflict carefully (regenerate api/openapi.json and src/lib/api/schema.d.ts with pnpm api:types rather than hand-merging), run all checks, and commit. Never push." | Out-Null
    }
  }
  git -C $wt push -q --force-with-lease -u origin $Branches[$m]
  $pr = Get-PrState $m
  if (-not $pr -or $pr.state -ne "OPEN") {
    $body = "Milestone $m. See docs/build/$m.md for the brief, checklist and review notes.`n`n🤖 Generated with [Claude Code](https://claude.com/claude-code)"
    Push-Location $wt
    try { gh pr create --base main --head $Branches[$m] --title $Titles[$m] --body $body | Out-Null } finally { Pop-Location }
    $pr = Get-PrState $m
  }
  return $pr.number
}

function Wait-Ci([string]$m, [int]$pr) {
  for ($round = 0; $round -le $MaxFixRounds; $round++) {
    Say "${m}: waiting for CI on PR #$pr"
    Start-Sleep -Seconds 20
    gh pr checks $pr --repo devharunah/neurotrack --watch --interval 30 | Out-Null
    if ($LASTEXITCODE -eq 0) { Say "${m}: CI green"; return }
    $run = gh run list --repo devharunah/neurotrack --branch $Branches[$m] --limit 1 --json databaseId --jq ".[0].databaseId"
    $failed = (gh run view $run --repo devharunah/neurotrack --log-failed 2>&1 | Out-String)
    if ($failed.Length -gt 12000) { $failed = $failed.Substring($failed.Length - 12000) }
    Invoke-Claude $m "ci-fix" "CI failed on this branch (PR #$pr). Here is the end of the failed log:`n$failed`nFind the root cause, fix it, run the relevant checks locally, and commit. Never push." | Out-Null
    git -C (Get-Worktree $m) push -q --force-with-lease
  }
  throw "${m}: CI still failing after $MaxFixRounds fix rounds"
}

function Push-Migrations([string]$m) {
  if ($SkipDbPush) { Say "${m}: skipping db push (-SkipDbPush)"; return }
  $wt = Get-Worktree $m
  Push-Location $wt
  try {
    supabase link --project-ref $SupabaseRef *> $null
    $dry = (supabase db push --dry-run 2>&1 | Out-String)
    Say "${m}: migration dry run:`n$dry"
    if ($dry -match "Would push") { "Y" | supabase db push }
  } finally { Pop-Location }
}

function Test-E2e([string]$m) {
  $wt = Get-Worktree $m
  $api = Start-Process -PassThru -WindowStyle Hidden -WorkingDirectory (Join-Path $wt "api") -FilePath "uv" -ArgumentList "run", "uvicorn", "app.main:app", "--port", "8000"
  try {
    for ($i = 0; $i -lt 30; $i++) {
      try { Invoke-RestMethod http://127.0.0.1:8000/health -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 2 }
    }
    Get-Content (Join-Path $wt ".env.local") | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } | ForEach-Object {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
    Push-Location $wt
    $env:E2E_PORT = "3100"  # fresh build on its own port; never reuse a stray dev server
    try { $out = (pnpm e2e 2>&1 | Out-String); $ok = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
    $out | Set-Content -Encoding utf8 (Join-Path $LogDir "$m-e2e-$(Get-Date -Format yyyyMMdd-HHmmss).log")
    return @{ ok = $ok; out = $out }
  } finally {
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match "uvicorn app.main:app" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
}

foreach ($m in $Milestones) {
  $pr = Get-PrState $m
  $status = if ($pr) { "PR #$($pr.number) $($pr.state)" } else { "no PR" }
  Say "${m}: $(Get-OpenBoxes $m) boxes open, $status"
  if ($DryRun) { continue }
  if ($pr -and $pr.state -eq "MERGED") { continue }

  Ensure-Worktree $m
  Build-Milestone $m
  for ($round = 0; $round -le $MaxFixRounds; $round++) {
    $prNumber = Push-AndPr $m
    Wait-Ci $m $prNumber
    Push-Migrations $m
    $e2e = Test-E2e $m
    if ($e2e.ok) { break }
    if ($round -eq $MaxFixRounds) { throw "${m}: E2E still failing after $MaxFixRounds fix rounds" }
    $tail = $e2e.out; if ($tail.Length -gt 12000) { $tail = $tail.Substring($tail.Length - 12000) }
    Invoke-Claude $m "e2e-fix" "Playwright E2E failed locally against the real Supabase project with the API running. Output:`n$tail`nFix the root cause (app code or test), run checks, and commit. Never push and never run supabase db push." | Out-Null
  }
  if ($NoMerge) { Say "${m}: PR #$prNumber is green; stopping (-NoMerge)"; break }
  gh pr merge $prNumber --repo devharunah/neurotrack --squash | Out-Null
  Say "${m}: merged PR #$prNumber"
}
Say "Done."
