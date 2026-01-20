#!/bin/bash
#
# Setup Python environment for Panopticon
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🐍 Setting up Python environment..."

cd "$SCRIPT_DIR"

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate and install dependencies
echo "   Installing dependencies..."
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "✅ Python environment ready!"
echo ""
echo "To activate manually:"
echo "   source $SCRIPT_DIR/.venv/bin/activate"
