# Writing layout adjustments

The latest request supersedes the earlier fixed viewport y=700 rule. Both Background and Details panel borders and editable regions now end 674 viewport CSS pixels below the native sheet window's top edge. Scaling is included.

Live checks found Details border bottoms at 673.993px and editor bottoms at 673.994px relative to the sheet window; Background border bottoms at 674.000px and editor bottoms at 673.994px. Both columns matched on each tab.

Background sections move together to put title ink 8px below the panel border. The title boxes measured 8.41px and 8.36px below it (font box and visible ink differ slightly). Notes toolbar controls center at x=639.99997px within a menu centered at x=640px.

The live Details template's two legacy editor expressions were converted individually to native prose-mirror elements, retaining `system.details.appearance` and `system.details.goals` bindings and existing enriched content. Both formatting toolbars appeared and the sheet reopened successfully with its existing blank content intact. No test text was written to actor data. The source template currently lacks a Details tab; the scoped template migration is retained separately rather than overwriting the live template with the older source page.

Existing chapter-header positions, actor data, artwork, other tab bodies, and native attach/detach behavior are preserved. Inline top/height overrides and custom properties restore on helper cleanup. Live screenshots and measurements are saved under `output/qa/writing-layout-*20261020.*`.

CSS and JavaScript builds, lint, and type checking passed. Focused tests and independent implementation review cover the scaled geometry and cleanup.
