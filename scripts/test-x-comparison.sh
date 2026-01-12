#!/bin/bash
#
# Compare X API vs Grok for fetching tweet data
#
# Usage:
#   ./scripts/test-x-comparison.sh [username]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load environment
set -a
source .env 2>/dev/null || true
set +a

echo "═══════════════════════════════════════════════════════════"
echo "🔬 X API vs Grok Comparison Test"
echo "═══════════════════════════════════════════════════════════"
echo

cd packages/server
DOTENV_CONFIG_PATH="$PROJECT_ROOT/.env" npx tsx src/test/x-comparison.test.ts "${1:-elonmusk}"
