# Foundry deployment target

Paul designated the Westford copy as the default for future OSP House Rules changes on 2026-11-10.

- Live URL: https://westford.the-citadel.us/game
- Edit and build in `/System/Volumes/Data/mnt/foundry/westford-data/Data/systems/osp-houserules`.
- The Narlington checkout is a separate copy. Its builds do not update Westford. If a chat starts in Narlington, explicitly use the Westford directory for project commands and edits rather than relying on the inherited working directory.
- Do not switch to Narlington or an isolated local instance unless Paul requests it. The world ID `westford` alone does not identify the service or data folder.
- Preserve Westford's existing changes. Do not synchronize the whole Narlington checkout over it or overwrite world data, compendiums, or configuration.
- For source changes, generate the corresponding runtime files in Westford's `dist/` and confirm the live page loads them. Source edits alone are not deployment.
- Back up affected live runtime files before replacing them. Test requested interactions in the live Westford session after reloading; passing unit tests alone does not establish live completion.

@/Users/paul/.codex/RTK.md

## Item artwork

- All item artwork and item thumbnails must use `.webp`. Preserve transparency when present.
