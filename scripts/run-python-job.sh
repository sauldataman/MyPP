#!/bin/bash
#
# Run a Python job from the python/ directory
#
# Usage:
#   ./scripts/run-python-job.sh jobs.daily_social_analysis
#   ./scripts/run-python-job.sh analysis.process_archive
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_ROOT/python"

# Load environment variables
set -a
source "$PROJECT_ROOT/.env" 2>/dev/null || true
set +a

# Check if virtual environment exists
if [ -d "$PYTHON_DIR/.venv" ]; then
    source "$PYTHON_DIR/.venv/bin/activate"
fi

# Run the Python module
cd "$PYTHON_DIR"
python -m "$@"
