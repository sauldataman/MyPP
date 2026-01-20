#!/bin/bash
#
# Daily Social Media Analysis (Python version)
#
# Analyzes tweets from watchlist accounts using Grok API.
# Designed to run as a cron job every morning.
#
# Usage:
#   ./scripts/daily-analysis.sh
#
# Cron example (run at 7 AM daily):
#   0 7 * * * /path/to/MyPP/scripts/daily-analysis.sh >> /path/to/MyPP/logs/daily-analysis.log 2>&1
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_ROOT/python"

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Load environment variables
set -a
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set +a

# Check required environment variable
if [ -z "$XAI_API_KEY" ] && [ -z "$GROK_API_KEY" ]; then
    echo "❌ XAI_API_KEY or GROK_API_KEY is required"
    echo "   Add it to your .env file"
    exit 1
fi

# Activate virtual environment if exists
if [ -d "$PYTHON_DIR/.venv" ]; then
    source "$PYTHON_DIR/.venv/bin/activate"
fi

# Run the analysis
cd "$PYTHON_DIR"
python -m jobs.daily_social_analysis "$@"
