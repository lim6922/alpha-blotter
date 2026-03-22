#!/usr/bin/env bash

set -euo pipefail

install_global_package() {
  local package_name="$1"

  if npm list -g --depth=0 "$package_name" >/dev/null 2>&1; then
    echo "$package_name is already installed"
    return
  fi

  echo "Installing $package_name"
  npm install -g "$package_name"
}

install_global_package "@openai/codex"
install_global_package "@google/gemini-cli"
