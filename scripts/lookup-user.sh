#!/bin/bash
# Look up X/Twitter user
# Usage:
#   ./scripts/lookup-user.sh bitfish
#   ./scripts/lookup-user.sh --id 123456789

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

set -a
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set +a

cd "$PROJECT_ROOT/python"
python -m tools.lookup_user "$@"
