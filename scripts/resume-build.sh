#!/usr/bin/env bash
# Resume the M2-M5 parallel build with headless Claude Code, waiting out usage limits.
# Same behaviour as scripts/resume-build.ps1. Usage:
#   scripts/resume-build.sh                 # all unfinished milestones, in parallel
#   scripts/resume-build.sh m3 m4           # only these
#   LIMIT_WAIT_MIN=45 scripts/resume-build.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(dirname "$REPO")"
BASE_BRANCH="feat/m2-m5"
LIMIT_WAIT_MIN="${LIMIT_WAIT_MIN:-30}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-24}"
LOG_DIR="$REPO/logs/build"
mkdir -p "$LOG_DIR"
MILESTONES=("$@")
[ $# -eq 0 ] && MILESTONES=(m2 m3 m4 m5)

branch_for() {
  case "$1" in
    m2) echo feat/m2-neurolab ;; m3) echo feat/m3-behaviourlab ;;
    m4) echo feat/m4-research ;; m5) echo feat/m5-hardening ;;
  esac
}

remaining() {
  local brief="$PARENT/nt-$1/docs/build/$1.md"
  [ -f "$brief" ] || brief="$REPO/docs/build/$1.md"
  grep -cE '^\s*- \[ \]' "$brief" || true
}

ensure_worktree() {
  local m="$1" wt="$PARENT/nt-$1" branch
  branch="$(branch_for "$m")"
  [ -d "$wt" ] && return
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$REPO" worktree add "$wt" "$branch"
  else
    git -C "$REPO" worktree add -b "$branch" "$wt" "$BASE_BRANCH"
  fi
  for f in .env.local api/.env; do [ -f "$REPO/$f" ] && cp "$REPO/$f" "$wt/$f"; done
}

run_milestone() {
  local m="$1" wt="$PARENT/nt-$1" attempt left log out
  local prompt="You are resuming milestone $m of the NeuroTrack M2-M5 parallel build. You are in its git worktree.
Read docs/build/STATUS.md (rules) and docs/build/$m.md (your brief and checklist). Check git log
and git status to see what is already done. Then continue with the first unticked items, ticking
each box in the same commit as its work. Follow every rule in STATUS.md: stay in your files,
never push, never run supabase db push, never run pnpm e2e. Before you stop, make sure the checks
pass, everything is committed, and the Notes section is up to date."
  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    left="$(grep -cE '^\s*- \[ \]' "$wt/docs/build/$m.md" || true)"
    if [ "$left" -eq 0 ]; then echo "[$m] checklist complete"; return 0; fi
    log="$LOG_DIR/$m-$(date +%Y%m%d-%H%M%S).log"
    echo "[$m] attempt $attempt, $left boxes left, log: $log"
    out="$(cd "$wt" && claude -p "$prompt" --permission-mode auto --output-format json 2>&1 || true)"
    printf '%s\n' "$out" > "$log"
    if grep -qiE 'usage limit|rate limit|limit reached|limit will reset|resets at|overloaded|429' <<<"$out"; then
      echo "[$m] hit a usage/rate limit; sleeping ${LIMIT_WAIT_MIN} min"
      sleep $((LIMIT_WAIT_MIN * 60))
    fi
  done
  echo "[$m] stopped after $MAX_ATTEMPTS attempts; check logs"
}

pids=()
for m in "${MILESTONES[@]}"; do
  if [ "$(remaining "$m")" -gt 0 ]; then
    ensure_worktree "$m"
    run_milestone "$m" &
    pids+=($!)
  fi
done
for pid in "${pids[@]}"; do wait "$pid"; done

unfinished=()
for m in "${MILESTONES[@]}"; do [ "$(remaining "$m")" -gt 0 ] && unfinished+=("$m"); done
if [ ${#unfinished[@]} -gt 0 ]; then echo "Still unfinished: ${unfinished[*]}. Re-run this script."; exit 1; fi
echo "All milestone checklists complete. Integrate with: pwsh scripts/resume-build.ps1 -Integrate"
