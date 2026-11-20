# Bound Almanac artwork

`almanac-page.png` is a decorative background created with the built-in image-generation tool from the user-approved calendar render on 2026-10-26. Calendar text, dates, controls, and the analogue clock are rendered separately by the application.

Reference: `output/qa/calendar/approved-almanac.png`.

Generation prompt:

> Create a production UI BACKGROUND texture asset by extracting the decorative blank book-page from this approved calendar render. Landscape 3:2 aspect. KEEP the thin dark forest green stitched leather rectangular outer binding, antique brass corner protectors, left slim spine, creamy ivory parchment page, delicate gold botanical flourishes only in four corners, hairline inset brass rectangular page border. REMOVE ALL text, ALL numbers, ALL clock and hands, ALL buttons, ALL tabs protruding at right, ALL calendar grid lines, ALL icons, ALL horizontal separators and ALL content. Entire central interior must be calm uninterrupted near-blank pale parchment for real HTML controls to overlay. Decorations confined to outermost 4 percent edges, generous content-safe space across center. Front-on orthographic flat UI asset, frame fills image edge-to-edge, no external background, no shadows cast outside, no perspective. Match approved materials and colors faithfully, no extra ornaments in center. This is a blank page frame asset not a mockup screenshot.

## Clock and control ornaments

`clock-ornament.png` was generated from the same user-approved render on 2026-10-26 with the built-in image tool. It contains only a blank ivory face, brass bezel and surrounding gold leaves. Live SVG provides ticks, numerals and hands.

Prompt: Extract and recreate ONLY the antique brass analogue clock frame with the gold botanical leaves around its left and right sides from the upper-right of this approved fantasy calendar. Production isolated UI ornament, transparent background. Exact same ornate warm-gold engraved layered bezel, pointed small cardinal studs, detailed symmetrical warm-brass laurel-like leaves branching to left and right. Circular clock face must be completely BLANK pale ivory parchment: NO numerals, NO ticks, NO hands, NO center pin, NO text or time plaque. Those are live SVG elements added in app. Outer leaves occupy whole landscape canvas, central circular blank face takes 52% canvas width and 80% canvas height; side leaves remain within canvas. Top-down front-facing flat UI asset matching reference, no perspective. Fully transparent outside the clock and leaves. One isolated asset, no calendar grid, no text, no other objects. Bright polished antique gold not copper or silver. Landscape canvas.

The three `button-*.svg` frames, `nav-medallion.svg`, `market-ribbon.svg`, and `rule-diamond.svg` are original geometric UI decorations. Labels and icons remain live accessible HTML.

## Reduced corner artwork

`almanac-page-small-corners.png` is a built-in image-tool edit of `almanac-page.png`, requested by the user on 2026-10-26. Prompt: preserve the frame, parchment, spine, materials and colors; reduce top-left and both bottom botanical flourishes to about half their original dimensions; remove the top-right botanical flourish entirely, leaving clean parchment and the thin inset rules. Do not draw a clock, text or grid. The application positions its live brass clock in the cleared corner.

## Regenerated engraved border

`almanac-page-engraved.png` replaces the reduced-corner background at the user's request. Generated with the built-in image tool using the preceding asset as reference. Direction: refined engraved antique brass, consistent fine botanical linework, three small balanced corner flourishes, unchanged green leather/parchment palette and safe areas, clean upper-right clock space; no clock or UI baked into the artwork.

## Matching upper-right corner

`almanac-page-four-corners.png` is an image-tool edit of the engraved border, requested by the user. Prompt: add an upper-right botanical flourish mirroring the upper-left in scale, fine brass linework and restrained shading; preserve the other three corners, green binding, parchment, spine and blank center. No clock or UI content baked in.

## Joined frame repair

`almanac-page-joined-frame.png` repairs the four-corner asset using image generation: removes the duplicate right border and connects all four botanical stems to a consistent double-rule rectangle. Outer leather, brass caps, binding and parchment are preserved. Content is inset inside this frame.

## Foreground border layer

`almanac-frame-overlay.png` is a transparent image-tool extraction of the joined frame, preserving the outer frame, inner rules and botanical ornaments. It renders above the month grid with pointer events disabled so the decorative corners cover grid lines naturally.
