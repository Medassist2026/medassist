#!/usr/bin/env bash
# cleanup-capacitor-deadcode.sh
#
# One-shot deletion of unreachable Capacitor/SQLite scaffolding from
# packages/shared/. Run once, then `git add -A && git commit`.
#
# Background: D-005 amendment (Capacitor PWA shell adopted) + LAN-sync
# deferral. See docs/investigations/CAPACITOR_BUILD_INVESTIGATION.md for
# the reachability analysis that justifies each removal.
#
# Files removed are unreachable from any apps/clinic entry point. The
# only kept file in packages/shared/lib/offline/ is idb-cache.ts, which
# is the IndexedDB-based offline write queue OfflineIndicator already
# uses. Phase 1 of the offline-write feature will wire idb-cache.ts
# into actual write paths (frontdesk/queue/checkin first).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "Removing Capacitor/SQLite-bound dead code..."

# offline/ — everything except idb-cache.ts
rm -f packages/shared/lib/offline/lan-discovery.ts
rm -f packages/shared/lib/offline/lan-sync.ts
rm -f packages/shared/lib/offline/local-db.ts
rm -f packages/shared/lib/offline/morning-sync.ts
rm -f packages/shared/lib/offline/sw-register.ts
rm -f packages/shared/lib/offline/sync-engine.ts
rm -f packages/shared/lib/offline/sync-queue.ts
rm -f packages/shared/lib/offline/data-service.ts

# hooks orphaned by ConnectionStatus removal
rm -f packages/shared/hooks/useOfflineStatus.ts
rm -f packages/shared/hooks/useClinicPeers.ts

# orphan UI
rm -f packages/shared/components/ui/ConnectionStatus.tsx
rm -f packages/shared/components/ui/OfflineIndicator.tsx  # legacy duplicate; the live one is in @ui-clinic

echo "Done. Remaining offline/ contents:"
ls -1 packages/shared/lib/offline/

echo ""
echo "Next steps:"
echo "  1. npx tsc --noEmit         (expect 0 errors — was 3)"
echo "  2. npm run build:clinic     (expect 41/41 pages)"
echo "  3. git add -A && git commit -F docs/investigations/CLEANUP_COMMIT_MSG.txt"
