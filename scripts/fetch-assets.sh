#!/usr/bin/env bash
# Fetches CC0 asset packs into public/assets/_packs (git-ignored). Re-runnable.
set -euo pipefail
cd "$(dirname "$0")/../public/assets/_packs"
clone() { local url="$1" dir="$2"; if [ -d "$dir/.git" ]; then echo "have $dir"; else git clone --depth 1 -q "$url" "$dir" && echo "fetched $dir"; fi; }
clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 kaykit-adventurers
clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 kaykit-skeletons
clone https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 kaykit-dungeon
clone https://github.com/J-Ponzo/gltf-universal-animation-library quaternius-ual
du -sh . 2>/dev/null
