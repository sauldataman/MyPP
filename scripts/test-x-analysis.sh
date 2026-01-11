#!/bin/bash
#
# Test X Analysis Feature
#
# This script sets up the environment and runs the X analysis test.
#
# Usage:
#   ./scripts/test-x-analysis.sh [username] [hours]
#
# Examples:
#   ./scripts/test-x-analysis.sh elonmusk 24
#   ./scripts/test-x-analysis.sh sama 48
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "═══════════════════════════════════════════════════════════"
echo "🔭 Personal Panopticon - X Analysis Test"
echo "═══════════════════════════════════════════════════════════"
echo

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "   Created .env from .env.example"
        echo "   Please edit .env and add your API keys"
        exit 1
    else
        echo "   Creating minimal .env..."
        cat > .env << 'EOF'
# LLM API Keys
ANTHROPIC_API_KEY=your-anthropic-key
XAI_API_KEY=your-grok-key

# Optional
GEMINI_API_KEY=
OLLAMA_HOST=http://localhost:11434

# Database (for full server)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/panopticon

# Redis (for full server)
REDIS_URL=redis://localhost:6379
EOF
        echo "   Created .env - please add your API keys"
        exit 1
    fi
fi

# Load environment
source .env 2>/dev/null || true

# Check required keys
if [ -z "$XAI_API_KEY" ] || [ "$XAI_API_KEY" = "your-grok-key" ]; then
    echo "❌ XAI_API_KEY is not set in .env"
    echo "   Get your Grok API key from: https://console.x.ai/"
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your-anthropic-key" ]; then
    echo "⚠️  ANTHROPIC_API_KEY is not set - will use fallback mode (direct Grok)"
fi

echo "📋 Environment:"
echo "   XAI_API_KEY: ✅ Set"
[ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "your-anthropic-key" ] && \
    echo "   ANTHROPIC_API_KEY: ✅ Set" || echo "   ANTHROPIC_API_KEY: ⚠️ Not set (fallback mode)"
echo

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
    echo
fi

# Navigate to server package
cd packages/server

# Run the test
echo "🚀 Running X Analysis test..."
echo
npx tsx src/test/x-analysis.test.ts "${1:-elonmusk}" "${2:-24}"
