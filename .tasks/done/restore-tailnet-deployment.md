# Restore Tailnet deployment

## Request

Provide the music-player deployment link using Tailscale only. Then update the site manager so fresh deployments revive sites that have no new expiry.

## Implementation

- Updated `/home/mada/tools/caddy-sites-manager/site-manager.js`: `registerManifest` now removes stale entries from the global expiry map for every subdomain in the manifest being deployed. It leaves unrelated expiry entries untouched and does not duplicate an already registered manifest.
- Added a regression test covering deployment of an already registered, expired manifest.
- Committed the manager change as `15720a0` (`Revive expired sites on fresh deployment`).
- Redeployed this workspace. The prior `music-player` expiry was removed and its Tailnet route was restored.

## Verification

- `pnpm test` in `/home/mada/tools/caddy-sites-manager` — passed: 46 tests.
- `site-manager deploy website.json` — registered the current workspace and reconciled `music-player.ts.babyjarvis.com` as a static site.
- `curl -I --max-time 15 https://music-player.ts.babyjarvis.com` — HTTP 200.
- `git diff --check` — passed for both repositories.

## Channel description

The invocation RPC bridge was unavailable, so the channel-description URL publisher could not report or confirm an update. The validated Tailnet URL is: `https://music-player.ts.babyjarvis.com`.
