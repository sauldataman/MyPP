#!/bin/bash
#
# Enrich Twitter Archive Users with Details
#
# Usage:
#   ./scripts/enrich-users.sh /path/to/twitter-archive/data --type mutual
#   ./scripts/enrich-users.sh /path/to/twitter-archive/data --type following
#   ./scripts/enrich-users.sh /path/to/twitter-archive/data --type not_following_back
#
# Options:
#   --type    : mutual (default), following, followers, not_following_back
#   --limit N : Only process first N users
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_ROOT/python"

# Load environment variables
set -a
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set +a

# Check API key
if [ -z "$XAI_API_KEY" ] && [ -z "$GROK_API_KEY" ]; then
    echo "❌ XAI_API_KEY or GROK_API_KEY is required"
    echo "   Add it to your .env file"
    exit 1
fi

# Activate virtual environment if exists
if [ -d "$PYTHON_DIR/.venv" ]; then
    source "$PYTHON_DIR/.venv/bin/activate"
fi

cd "$PYTHON_DIR"
python -m analysis.enrich_users "$@"
