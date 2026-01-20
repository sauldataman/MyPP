#!/bin/bash
# Batch unfollow users
# Usage:
#   ./scripts/batch-unfollow.sh --ids 123,456,789
#   ./scripts/batch-unfollow.sh --file ids.txt
#   ./scripts/batch-unfollow.sh --json reports/twitter-archive/not_following_back-enriched-xxx.json
#   ./scripts/batch-unfollow.sh --json file.json --dry-run

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

set -a
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set +a

cd "$PROJECT_ROOT/python"
python -m tools.batch_unfollow "$@"
