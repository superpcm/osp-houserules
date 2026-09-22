# Portrait layers

## Frame revision 3

Current foreground asset: `portrait-frame-alpha-v3.png`. Created with the built-in image-generation tool to unify the top rail's parchment surface. Previous assets retained.

Final prompt:

Use case: precise-object-edit. Make ONLY a surface-texture correction to the TOP parchment rail of this transparent frame. Currently a darker torn-paper band runs along the top outer edge with an obvious wavy horizontal seam separating it from the lighter main frame. Remove that darker backing-paper band and its demarcation seam. Make the ENTIRE top rail a single continuous piece of light cream parchment matching the color/material/texture of the left, right and bottom rails. Keep a naturally worn outer edge, but NO second paper layer, NO horizontal seam, NO darker stripe. Absolutely preserve the frame silhouette, canvas size, slight tilt, transparent opening position and dimensions, all four brass corner protectors, mushrooms, and other three edges. Do not shift the opening. Genuine alpha transparency inside and outside, no checkerboard, no new objects or text.

## Frame revision 2

Current foreground asset: `portrait-frame-alpha-v2.png`. Built-in image-generation edit; original retained. Lowered the opening clear of the top protectors and removed the extra left backing-paper strip.

Initial edit prompt:

Use case: precise-object-edit. Edit this transparent portrait frame asset in exactly two ways. 1) Lower the TOP edge of the transparent photo opening enough that there is a clearly visible continuous cream parchment band between the opening and BOTH upper brass corner protectors, including their lowest tips. Increase the top mat thickness downward, about 90 pixels at this resolution. Keep the opening's lower edge unchanged and its top edge parallel to the current angled top rail. The opening must not touch or notch around the metal protectors: simple four-sided opening with natural subtly rounded corners, no triangular cutouts. 2) Remove the entire darker extra torn backing-paper strip protruding along the OUTSIDE LEFT edge. Leave a single clean cream parchment frame edge, no stacked paper fringe or brown strip. Preserve outer frame placement, canvas size, all four original brass protectors, bottom mushroom drawing, right and bottom borders, original colors and texture, slight tilt. Real alpha transparency inside opening and outside frame. No checkerboard painted, no annotations, no text, no picture inside.

Final refinement prompt:

Precise single-change edit to this transparent frame. The top parchment mat is slightly too thick. Move ONLY the top edge of the transparent opening UP about 50 pixels, keeping it parallel to its present angle, so the opening begins about 20-30 pixels BELOW the lowest tips of both top brass protectors. Keep a clear continuous parchment gap between metal and opening. Do not move the corner protectors. Do not change bottom opening edge, side edges, outer frame, canvas dimensions, mushrooms, colors, or texture. Preserve the cleaned single left edge with no extra backing-paper strip. Preserve real alpha transparency inside/outside; no checkerboard. No triangular cutouts.

Created with the built-in image-generation tool.

Assets:
- `portrait-frame-alpha.png`: separate foreground frame with real alpha transparency inside and outside.
- `bio-without-portrait-frame.png`: parchment background without the baked-in portrait frame.

The live portrait sits between these layers. The frame is an independent, non-interactive image, not a polygon cutout. Portrait zoom and pan remain on the photograph only.

## Frame prompt

Use case: background-extraction. Extract ONLY the small parchment portrait photo frame at the upper left of this reference sheet into a standalone transparent PNG asset. Crop closely around the entire frame including all four brass corner protectors and the tiny mushrooms printed on the wider bottom mat. Keep its original cream parchment texture, slight counterclockwise tilt, irregular natural edges, intact top/side/bottom rails and full brass corners. The entire central photo opening must be genuinely transparent alpha, as must everything outside the frame; NO parchment inside the opening, NO checkerboard drawn, NO photo or character. This will be a foreground overlay on a live photograph. Preserve natural contour of actual frame, no invented triangular paper cutouts into opening. Frame alone fills the canvas with a small transparent margin. Match original frame proportions, about 360 wide by 438 tall. Do not include any other part of the sheet.

## Background prompt

Use case: precise-object-edit. Edit target: this exact 1185x1327 game sheet background. Remove ONLY the portrait frame at upper left (roughly x80..438 y60..498), including brass corner caps, inner panel edges, mushroom drawing, frame shadows. Fill that region with seamless matching blank parchment from the surrounding large top panel. Keep EVERY other element unchanged: full book outer border, all other paper panels, all six circular ability medallions and their tiny icons, all lower panels, textures and positions. No new text or objects. Preserve exact full canvas aspect ratio and composition. This is the background layer beneath a separately overlaid portrait and photo frame.
