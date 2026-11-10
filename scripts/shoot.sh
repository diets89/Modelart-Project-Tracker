#!/bin/sh
# Dev helper: build, launch against a data folder, run JS steps and save screenshots.
# usage: scripts/shoot.sh <dataDir> <theme> "<shot1.png,shot2.png>" "<js1|||js2>"
npx electron-vite build >/dev/null 2>&1 || { echo build failed; exit 1; }
MAT_PROFILE=shot MAT_USER=${MAT_USER:-diets} MAT_THEME="$2" MAT_DATA_DIR="$1" MAT_SHOT="$3" MAT_SHOT_JS="$4" timeout 90 npx electron . 2>&1 | grep -iE "error|warn" | head -5
