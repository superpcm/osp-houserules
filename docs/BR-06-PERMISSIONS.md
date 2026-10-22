# BR-06 permissions boundary

Inventory mutations use Foundry's document lifecycle transport. A requester creates a `ChatMessage` containing an `inventoryAuthority` flag envelope. The `createChatMessage` hook's third `userId` argument is the authoritative user supplied by the server; the handler requires it to equal the envelope requester before queueing work. The active GM creates a result message for that requester. Result consumers require the hook creator to be an active GM and require the operation id, requester, and request fingerprint to match a pending request. Raw socket execution and insecure fallbacks are not used. If `ChatMessage.create` or `Hooks.on` is unavailable, requests fail closed. Transport flags carry request metadata and a small result status allowlist; shared ChatMessage and world-setting state must still be treated as replicated data, and receipts intentionally retain recovery snapshots.

Foundry v14's server document lifecycle overwrites the request `userId` from the authenticated backend user before invoking document processing (the local proof is `FoundryVTT-Node-14.367/dist/database/backend/server-backend.mjs`, where `modifyDocument` obtains `e.user`, rejects a missing user, and sets `t.userId = o.id`). The unused system socket relay is disabled in `system.json`; deploying this change requires restarting Foundry and reloading clients so legacy socket handlers cannot remain active.

The authoritative handler checks native actor ownership for player operations and an explicit DM action allowlist for GM-only personal-bank operations. The matrix is:

| Caller | Own actor | Another actor | DM-only action |
| --- | --- | --- | --- |
| owner | allowed for personal actions; shared actions require the actor's `party` flag | denied | denied |
| observer/unrelated player | denied | denied | denied |
| GM | allowed | allowed | allowed |

`storeLock` is enforced at the authoritative boundary for every bank, personal/shared storehouse, and treasury withdrawal. It does not block deposits or account-only transfers, and GMs bypass it. `playerLock` remains a roll/token interaction lock enforced by client hooks; it is not treated as a financial mutation lock.

Catalog and embedded-item permissions use Foundry's native document ownership. The former global `OBSERVER` override was removed, and newly created world items default to `NONE`; existing ownership is preserved. Embedded items inherit parent actor permissions. Public catalog entries require separately sanitized data: native ownership controls access through Foundry interfaces but does not redact source data already replicated to clients. The live observer client could inspect the secret fixture's name in its world-item collection despite failing its permission check. Truly confidential unidentified/secret information must stay outside player-replicated documents, flags, settings, and chat payloads. World settings used for party stores, party treasury, and receipts are `config: false`, but are shared state rather than confidential storage. Personal actor flags and native OWNER access likewise expose their stored data to authorized owners.

This boundary does not prevent a user with direct Foundry document-edit authority from editing documents outside these handlers, and it does not replace server configuration or deployment controls. `playerLock` is a client interaction restriction, not an adversarial security control.

## Live acceptance — 2026-09-30

Verified against Foundry 14.367 in the disposable `/private/tmp/osp-br05-rehearsal` world on port 30005 using separate GM, owner, and observer browser sessions. Campaign data was untouched.

- Before disabling the legacy relay and restarting the disposable server, an old connected raw-socket executor accepted a forged GM request. This confirmed the original vulnerability and the need for the manifest change and restart.
- After restart, the observer sent raw-socket and real ChatMessage requests claiming both GM and owner identities. Foundry supplied the observer's authenticated hook identity even with spoofed author/options. Both claims were rejected before receipt creation (receipt count stayed 34; operations `br06-forge-slYdxPMNfduZZuJA` and `br06-forge-1I0J7rupTMb5Yggh`).
- Owner bank, personal locker, shared store, and treasury withdrawals succeeded; direct DM bank/treasury and catalog grants failed. Observer requests failed across all these families, and a request targeting an unrelated actor failed without changing domain state. GM requests succeeded across all tested families, including another actor.
- With both locks enabled, all four live owner withdrawal families failed, while deposits and account-only transfers succeeded. The GM succeeded on all six checks. Unit tests additionally cover both item/currency withdrawal variants and all registered action families. Test locks were restored to off afterward.
- Public catalog observation succeeded; secret catalog observation failed; embedded-item observation followed actor ownership. This verifies permission behavior, not confidentiality of replicated document data.

## Automated validation

The combined inventory and item-permission run passed **648 tests across 19 files**, including the transport identity/acknowledgment tests, permission and lock matrices, and prior conservation/recovery/stack-identity regressions. Repository quality lint, TypeScript quality checking, release manifest validation, and the production Rollup build also passed. Independent review found no weakened assertions in the legacy transport fixture adaptations.

The live test export and screenshot are saved at `/private/tmp/br06-live-evidence.json` and `/private/tmp/br06-permissions-proof.png`. Production clients were not restarted; activate the new boundary by restarting Foundry and reloading every connected client after deployment.
