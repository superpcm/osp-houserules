# Character sheet theme baseline

The character sheet's pre-Store theme is preserved byte-for-byte in
`src/styles/pre-store-baseline.css`. It was copied from the saved development runtime last modified on October 22,
2026 (the capture folder was originally created October 5):

`/Users/paul/FoundryData/osp-test-captures/citadel-narlington-reference-20261005/updated/Data/systems/osp-houserules/dist/ose.css`

`scripts/build-css.js` emits that frozen baseline first, then appends the
isolated additions compiled from `src/styles/ose.scss`. Keep future Store
styles scoped to `.osp-store-app`; add any intentional character-sheet theme
change after the baseline as a separately reviewed stylesheet.

The reference character sheet window is 822×754. The Bio and Details template
regions were restored from the same saved runtime while preserving the
existing Background, Gear, Combat, Spells, and Notes regions.

Baseline: 1,619,242 bytes. SHA-256:
`fcc00ea6081241fb9e76b3b507bd30071651637506f86eda89dfa97e31e05c5b`.

Targeted layout repairs are kept in `src/styles/_sheet-layout-repairs.scss`,
separate from both the frozen baseline and Store styles. They restore the Gear
subtitle, skill-label clearance, Saving Throws subtitle spacing, and lower-edge
scroll treatment without changing the sheet dimensions.
