#!/usr/bin/env bash
# Run `anchor test` once per TS test file (fresh validator each time).
# Uses ANCHOR_MOCHA_FILES (see Anchor.toml [scripts] test); this script sets it per iteration.
#
# Test files: tests/**/*.ts except tests/utils/* and tests/lbtc.ts.
# Between runs: ANCHOR_TEST_EACH_SLEEP_SECONDS (default 5).
# Continues after failures; exits 1 if any file failed.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mapfile -t files < <(
  find tests -type f -name '*.ts' ! -path 'tests/utils/*' | LC_ALL=C sort
)

sleep_between="${ANCHOR_TEST_EACH_SLEEP_SECONDS:-5}"

failures=0
failed_files=()
first=1

for f in "${files[@]}"; do
  case "$(basename "$f")" in
    lbtc.ts) continue ;;
  esac

  if [[ "$first" -eq 0 ]] && [[ -n "${sleep_between}" && "${sleep_between}" != "0" ]]; then
    echo "Sleeping ${sleep_between}s before next anchor test (prior validator / port 8899)..."
    sleep "${sleep_between}"
  fi

  echo "============================================================"
  echo "ANCHOR_MOCHA_FILES=${f}"
  echo "============================================================"

  run_st=0
  if [[ "$first" -eq 1 ]]; then
    ANCHOR_MOCHA_FILES="$f" anchor test "$@" || run_st=$?
  else
    ANCHOR_MOCHA_FILES="$f" anchor test --skip-build "$@" || run_st=$?
  fi
  if [[ "$run_st" -ne 0 ]]; then
    failures=$((failures + 1))
    failed_files+=("$f")
  fi
  first=0
done

echo ""
if [[ "$failures" -eq 0 ]]; then
  echo "anchor-test-each: all files passed."
  exit 0
else
  echo "anchor-test-each: ${failures} file(s) failed:"
  for x in "${failed_files[@]}"; do
    echo "  - $x"
  done
  exit 1
fi
