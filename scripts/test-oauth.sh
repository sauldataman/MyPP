#!/bin/bash
set -a
source "$(dirname "$0")/../.env"
set +a

cd "$(dirname "$0")/.."
npx tsx scripts/test-oauth.ts
