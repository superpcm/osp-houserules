# Skills subheader correction

The live journal has an independent `syncHeaderSubtitleInkGaps` helper which was moving the heading alongside CSS subtitle adjustments. Its ink-gap target now accepts the subtitle's `--osp-subtitle-ink-gap` CSS property, defaulting to the previous rules for other headings. The workspace stylesheet supplies a 2px gap for the Skills subtitle. The live bundle was patched narrowly; unrelated live code was retained.

After allowing the ink-alignment helper to complete, before/after DOM measurements in the same viewport were:

| Element | Before top | After top |
| --- | ---: | ---: |
| Skill Targets heading | 82.98064px | 82.98032px |
| Subtitle | 109.26437px | 107.26405px |

The subtitle moved up 2.00032 visible pixels; the heading remained within 0.001px of its previous position. Target ring positioning was unchanged. CSS build and live JavaScript syntax validation passed. Screenshot: `output/qa/skills-subheader-corrected-20261020.png`.
