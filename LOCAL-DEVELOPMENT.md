# Local Foundry development

This checkout is loaded directly by the local Foundry user-data directory:

`/Users/Shared/foundry/narlington-data/Data/systems/osp-houserules`

## Prerequisites

- Node 24 at `/opt/homebrew/opt/node@24/bin/node`
- The licensed Foundry VTT v14 Node.js distribution extracted to
  `/Users/paul/Applications/FoundryVTT-Node-14.367`
- An isolated development user-data copy at `/Users/paul/FoundryData/osp-dev`

Both locations can be overridden with `OSP_NODE24` and `OSP_FOUNDRY_APP`.

## First-time project setup

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm ci
npm test
npm run build
```

## Daily workflow

The launcher restores the legacy world fonts and named player portraits from
`/Users/Shared/foundry/narlington-data/backups/foundrySharedData` before Foundry starts. Override
that source with `OSP_LEGACY_ASSETS`. You can also run `scripts/sync-dev-assets.sh` directly while
Foundry is already running, then reload the browser.

In one terminal, watch the JavaScript, TypeScript, and Sass sources:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run watch:all
```

In a second terminal, start Foundry locally:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run foundry:dev
```

Open <http://localhost:30000>.

The launcher defaults to the `westford` world because that is the world using
`osp-houserules`. Override it without editing the
shared Foundry configuration:

```bash
OSP_FOUNDRY_WORLD=narlington npm run foundry:dev
```

The launcher always disables UPnP and core updates and enables Foundry hot reload.

The development system directory is an overlay: source, templates, assets, and
compiled `dist` files link back to this checkout, while the mutable LevelDB
compendiums under `packs/` are local copies. Changes to source are live; changes
made to compendium contents in Foundry are intentionally isolated from Git.
