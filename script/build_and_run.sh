#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="Zcbox"
BUNDLE_ID="com.zcbox.desktop"
ARCH="${ARCH:-arm64}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
PNPM_BIN="${PNPM_BIN:-}"

if [[ -z "$PNPM_BIN" && -x "$HOME/Library/pnpm/pnpm" ]]; then
  PNPM_BIN="$HOME/Library/pnpm/pnpm"
fi

if [[ -z "$PNPM_BIN" ]]; then
  PNPM_BIN="$(command -v pnpm)"
fi

export PATH="$(dirname "$PNPM_BIN"):$PATH"
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"

case "$ARCH" in
  arm64)
    BUILDER_ARCH_FLAG="--arm64"
    DEFAULT_APP_BUNDLE="$RELEASE_DIR/mac-arm64/$APP_NAME.app"
    ;;
  x64)
    BUILDER_ARCH_FLAG="--x64"
    DEFAULT_APP_BUNDLE="$RELEASE_DIR/mac/$APP_NAME.app"
    ;;
  *)
    echo "unsupported ARCH=$ARCH; expected arm64 or x64" >&2
    exit 2
    ;;
esac

stop_app() {
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
}

build_app() {
  cd "$ROOT_DIR"
  "$PNPM_BIN" build
  "$PNPM_BIN" exec electron-builder --dir --mac "$BUILDER_ARCH_FLAG"
}

resolve_app_bundle() {
  if [[ -d "$DEFAULT_APP_BUNDLE" ]]; then
    printf '%s\n' "$DEFAULT_APP_BUNDLE"
    return
  fi

  local fallback
  fallback="$(find "$RELEASE_DIR" -maxdepth 2 -type d -name "$APP_NAME.app" | sort | head -n 1 || true)"
  if [[ -n "$fallback" ]]; then
    printf '%s\n' "$fallback"
    return
  fi

  echo "built app bundle not found under $RELEASE_DIR" >&2
  exit 1
}

open_app() {
  local app_bundle="$1"
  if /usr/bin/open -n "$app_bundle"; then
    return
  fi

  sleep 1
  /usr/bin/open -n "$app_bundle"
}

verify_app() {
  pgrep -x "$APP_NAME" >/dev/null 2>&1
}

stop_app
build_app
APP_BUNDLE="$(resolve_app_bundle)"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

if [[ ! -x "$APP_BINARY" ]]; then
  echo "app binary is not executable: $APP_BINARY" >&2
  exit 1
fi

case "$MODE" in
  run)
    open_app "$APP_BUNDLE"
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app "$APP_BUNDLE"
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app "$APP_BUNDLE"
    sleep 3
    verify_app
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
