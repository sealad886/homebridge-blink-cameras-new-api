#!/usr/bin/env bash
# Deploy homebridge-blink-cameras to Raspberry Pi
#
# Usage:
#   ./deploy-to-pi.sh             # Install latest published version from NPM (default)
#   ./deploy-to-pi.sh --no-wait   # Skip NPM version polling (useful if already published)

set -e

# ── Defaults ──────────────────────────────────────────────────────────────────
PI_HOST=${PI_HOST:-raspberrypi}
PI_USER="andrew"
REMOTE_TMP="/tmp"
PLUGIN_NAME="@sealad886/homebridge-blink-cameras-new-api"
WAIT_FOR_NPM=true
NPM_POLL_INTERVAL=10   # seconds between registry polls
NPM_POLL_TIMEOUT=300   # give up after 5 minutes

# ── Argument parsing ───────────────────────────────────────────────────────────
for arg in "$@"; do
	case "$arg" in
		--tarball)
			echo "The --tarball deployment mode has been removed." >&2
			echo "Publish through GitHub Actions and install the published version from npm instead." >&2
			exit 1
			;;
		--no-wait)  WAIT_FOR_NPM=false ;;
		*)
			echo "Unknown option: $arg" >&2
			echo "Usage: $0 [--no-wait]" >&2
			exit 1
			;;
	esac
done

PACKAGE_VERSION=$(node -p "require('./package.json').version")

# ── Resolve Pi host ────────────────────────────────────────────────────────────
echo "🔍 Resolving Raspberry Pi host..."
HOST_CANDIDATES=("$PI_HOST" "${PI_HOST}.local" "192.168.86.239" "192.168.86.20")
RESOLVED_HOST=""
for HOST in "${HOST_CANDIDATES[@]}"; do
	if nc -z -w1 "$HOST" 22 >/dev/null 2>&1; then
		RESOLVED_HOST="$HOST"
		break
	fi
done

if [ -z "$RESOLVED_HOST" ]; then
	echo "❌ Failed to resolve Raspberry Pi host. Tried: ${HOST_CANDIDATES[*]}" >&2
	exit 1
fi
echo "   Resolved: $RESOLVED_HOST"

# ── Install ────────────────────────────────────────────────────────────────────
echo ""
echo "📡 Registry mode: installing ${PLUGIN_NAME}@${PACKAGE_VERSION} from NPM..."

if [ "$WAIT_FOR_NPM" = true ]; then
	echo "⏳ Waiting for v${PACKAGE_VERSION} to appear on the NPM registry..."
	ELAPSED=0
	while true; do
		NPM_VERSION=$(npm view "${PLUGIN_NAME}@${PACKAGE_VERSION}" version 2>/dev/null || true)
		if [ "$NPM_VERSION" = "$PACKAGE_VERSION" ]; then
			echo "   ✅ v${PACKAGE_VERSION} is live on NPM"
			break
		fi
		if [ "$ELAPSED" -ge "$NPM_POLL_TIMEOUT" ]; then
			echo "❌ Timed out after ${NPM_POLL_TIMEOUT}s waiting for v${PACKAGE_VERSION} on NPM." >&2
			echo "   Run with --no-wait to skip polling if the version is already live." >&2
			exit 1
		fi
		echo "   Not published yet (${ELAPSED}s elapsed) — retrying in ${NPM_POLL_INTERVAL}s..."
		sleep "$NPM_POLL_INTERVAL"
		ELAPSED=$((ELAPSED + NPM_POLL_INTERVAL))
	done
fi

echo "🚀 Installing ${PLUGIN_NAME}@${PACKAGE_VERSION} on Pi via hb-service..."
ssh -t "${PI_USER}@${RESOLVED_HOST}" "sudo hb-service add ${PLUGIN_NAME}@${PACKAGE_VERSION}"

echo "🔄 Restarting Homebridge..."
ssh -t "${PI_USER}@${RESOLVED_HOST}" "sudo hb-service restart"

echo ""
echo "✅ Deployment complete! (v${PACKAGE_VERSION} on ${RESOLVED_HOST})"
