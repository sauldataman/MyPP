#!/bin/bash
#
# Analyze your X/Twitter followers
#
# Usage:
#   ./scripts/analyze-followers.sh [options]
#
# Options:
#   --export csv|json    Export format (default: json)
#   --filter TYPE        Filter followers by:
#                        - inactive: < 10 tweets
#                        - low-followers: < 100 followers
#                        - high-followers: > 10k followers
#                        - new: created < 6 months ago
#                        - no-bio: no description
#
# Examples:
#   ./scripts/analyze-followers.sh
#   ./scripts/analyze-followers.sh --export csv
#   ./scripts/analyze-followers.sh --filter inactive
#   ./scripts/analyze-followers.sh --filter low-followers --export csv
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load environment
set -a
source .env 2>/dev/null || true
set +a

# Check required key
if [ -z "$X_BEARER_TOKEN" ]; then
    echo "❌ X_BEARER_TOKEN is required"
    echo "   Add it to your .env file"
    exit 1
fi

cd packages/server
DOTENV_CONFIG_PATH="$PROJECT_ROOT/.env" npx tsx src/test/followers-analysis.ts "$@"
