# Isolated Foundry browser combat tests

These checks run in a separate Foundry 14.367 Node process, a new temporary data root, and the world `osp-browser-combat`. They do not use Westford's world database or live browser tab. The current built system is copied physically, without linking to production files. No build or deployment is needed.

## Preparation

```sh
node scripts/prepare-browser-combat.js
node scripts/start-browser-combat.js /private/tmp/osp-browser-combat-.../osp-browser-combat.json
```

The prepare command prints the exact second command and records the non-secret environment pointer in `output/browser-combat/environment.json`. The private license cache is copied from the existing local development installation; credentials are never printed. The server uses a Unix socket and a TCP proxy bound only to `127.0.0.1:31051`. It must never bind a publicly reachable address or use the campaign's data path.

On the first launch, use Foundry's setup screen to launch **OSP Browser Combat Test (isolated)**. Join its default GM, enable **OSP Browser Combat TEST ONLY** in Manage Modules, and reload. The module refuses other world IDs, hosts, ports, or non-disposable environment markers.

Click **Prepare / reset fixture**. This creates a synthetic player-owned Hero, an Enemy, and a square-grid scene containing a movement-blocking wall at x=500 ending at y=600. Reset affects only this module's scene, tokens, and encounters in the disposable world. It does not import campaign actors or repair campaign records.

Use the GM origin `http://127.0.0.1:31051` and the player origin `http://localhost:31051` for independent browser cookies. Join **Browser Test Player** on the second origin. Normal Foundry player ownership and wall restrictions apply; a GM movement test would not establish player collision behavior.

## Browser checks

`tests/browser/combat.cua.js` is the reusable driver for the approved CUA browser runtime. It accepts the existing GM and player tab handles. Browser actions must use CUA; the runner does not connect through an alternate CDP/Playwright driver or bypass browser security policies.

The instrumentation panel creates/reset fixtures and reads real Foundry documents. It does not move tokens or start/advance/end combat during acceptance checks. The browser must perform those actions through the actual token canvas and core combat controls.

- Move the owned Hero from (100,300) to (200,300) through an open square.
- Continue to (400,300), then attempt to move right through the wall. Confirm the real wall backend reports a collision and the player remains at (400,300).
- Move down to y=700 and cross to (500,700) through the open route below the wall.
- Create the encounter and add both tokens using core controls; start it, advance to the next turn and round, then end it. Read actual combatant/round/turn/document state at every checkpoint.
- Repeat after resetting the fixture, review client errors, and save JSON plus screenshots of the observed result.

## Cleanup and evidence

Stop the launcher's own terminal process with Ctrl-C. It closes its loopback proxy and only its child Foundry process. The disposable data remains available for diagnosis; never delete a guessed path or stop another Foundry instance.

Campaign/runtime hashes are captured separately before browser work and compared afterward. Server startup, a rendered login page, or passing offline tests alone do not count as movement/collision/combat acceptance. If browser automation is blocked, retain an explicit incomplete result rather than marking these checks passed.

## Verified run — 2026-11-14

All eight acceptance checkpoints passed in Chrome against Foundry 14.367. See `output/browser-combat/result.json` for the recorded result. This is a CUA-driven browser suite, not a headless CI command: import/paste the exported function into the approved CUA session and invoke it with the two authenticated tab handles after resetting the fixture. `npm run test:browser-guards` runs the eight environment safety tests; `npm run browser:prepare` creates a fresh world and `npm run browser:start -- <marker-path>` starts it.

Coordinates are read from TokenDocument serialized source (`toObject()`), because animation temporarily interpolates the live document fields. Native WASD keys are held for 180 ms to clear Foundry's 50 ms movement delay without keyboard repeat. The test uses the player session for wall restrictions. Combat Start automatically rolls actual initiative; expected turn and round transitions do not depend on which participant wins initiative.

The initial run found two existing system issues: `/templates/actors/marker-sheet.html` fails to preload in a clean installation, and the combat sidebar extends behind chat. Start/End clicks use the visible right edge of the actual button rectangle. Neither issue was repaired or hidden by this test. Eight scoped encounter passes do not establish an error-free client startup or correct sidebar layout.

The campaign hash baseline changed concurrently during testing, including world chat/macro storage and several source files. The test did not write those locations; it cannot establish that the entire campaign remained byte-for-byte unchanged. Isolation is enforced by the separate physical data root and browser origins. No production runtime was built or replaced.

## Marker and sidebar regression checks

The follow-up repair resolves marker preload through `OSP.systemPath()` and adds an embedded-tracker override for the character theme's leaked 800px combat-tab width. The browser runner now asserts that the combat tab and every visible combat button fit inside the sidebar and that each button center is unobscured. Start and End use ordinary semantic clicks; the earlier visible-edge workaround has been removed. Marker-template preload errors fail the rerun.

The fixture identifies newly created tokens by actor ID rather than assuming Foundry returns embedded documents in creation order. Canvas pan/token refresh events update screen coordinates, while persisted positions continue to use serialized documents. The GM panel's **Export browser evidence** downloads the complete checkpoint/input/error record.

Verified repair rerun: **8/8 browser checks passed**, marker preload errors absent, client error record empty. The combat panel measured 312px inside its 312px sidebar; all 19 visible combat button centers were unobscured. Start/End succeeded through ordinary semantic clicks. Full browser evidence is saved at `output/browser-combat/repair-evidence.json`, with the summary in `output/browser-combat/result.json`. The test server was stopped after evidence capture. Focused regression/build/guard tests passed 17/17; repository lint passed.
