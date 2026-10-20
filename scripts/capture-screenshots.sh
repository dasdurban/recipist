#!/usr/bin/env bash
#
# Captures the store screenshots Partner Center asks for.
#
# Requires at least one image; four is the recommended set, and the limits are
# roughly 1366x768 minimum and 3840x2160 maximum, PNG or JPEG.
#
# This drives the app through the browser tooling rather than the packaged
# build, so the shots are reproducible and do not need window juggling. Point
# it at the dev server:  npm run dev
#
# Usage:
#   scripts/capture-screenshots.sh [outdir]

set -euo pipefail

OUT="${1:-store-screenshots}"
BASE_URL="${BASE_URL:-http://localhost:5173}"

mkdir -p "$OUT"

if ! curl -s -o /dev/null "$BASE_URL"; then
  echo "Nothing answering at $BASE_URL. Start the dev server first: npm run dev" >&2
  exit 1
fi

echo "Screenshots go in $OUT"
echo "Capture these four views, at 1440x900 or larger:"
echo
echo "  1.  home.png              the recipe grid with health badges visible"
echo "  2.  recipe.png            a recipe open in the preview pane"
echo "  3.  plan.png              the event planner with a planned event"
echo "  4.  shopping.png          a shopping list, checked items included"
echo
echo "Partner Center wants PNG or JPEG, between 1366x768 and 3840x2160, and no"
echo "more than 10 images per listing. Avoid showing real personal data."
