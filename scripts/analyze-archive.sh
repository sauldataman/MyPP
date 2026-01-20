#!/bin/bash
#
# Analyze Twitter Archive
#
# Usage:
#   ./scripts/analyze-archive.sh /path/to/twitter-archive/data
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_ROOT/python"

if [ -z "$1" ]; then
    echo "Usage: ./scripts/analyze-archive.sh /path/to/twitter-archive/data"
    echo ""
    echo "The path should be the 'data' directory inside your extracted Twitter archive."
    exit 1
fi

# Activate virtual environment if exists
if [ -d "$PYTHON_DIR/.venv" ]; then
    source "$PYTHON_DIR/.venv/bin/activate"
fi

cd "$PYTHON_DIR"
python -m analysis.twitter_archive "$@"
