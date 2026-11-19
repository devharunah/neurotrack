#!/usr/bin/env bash
# The sequential build orchestrator is scripts/resume-build.ps1 (it drives gh, supabase, the API
# and Playwright). This wrapper runs it from Git Bash/macOS/Linux with PowerShell 7 (pwsh) or
# Windows PowerShell. All arguments pass through, e.g.:
#   scripts/resume-build.sh -DryRun
#   scripts/resume-build.sh -Milestones m4 -NoMerge
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if command -v pwsh >/dev/null 2>&1; then exec pwsh -NoProfile -File "$here/resume-build.ps1" "$@"; fi
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$here/resume-build.ps1" "$@"
