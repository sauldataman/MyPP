#!/bin/bash
#
# Daily Social Media Analysis
#
# Analyzes tweets from watchlist accounts using Grok API.
# Designed to run as a cron job every morning.
#
# Usage:
#   ./scripts/daily-social-analysis.sh
#
# Cron example (run at 7 AM daily):
#   0 7 * * * /path/to/MyPP/scripts/daily-social-analysis.sh >> /path/to/MyPP/logs/daily-analysis.log 2>&1
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load environment variables
set -a
source .env 2>/dev/null || true
set +a

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Check required environment variable
if [ -z "$XAI_API_KEY" ] && [ -z "$GROK_API_KEY" ]; then
    echo "❌ XAI_API_KEY or GROK_API_KEY is required"
    echo "   Add it to your .env file"
    exit 1
fi

# Run the analysis
cd packages/server
npx tsx src/jobs/daily-social-analysis.ts "$@"
