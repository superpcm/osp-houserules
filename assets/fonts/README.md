# Cooper Standard Font Setup

## Current Status
The tabs are configured to use **Cooper Standard** font, but will fall back to generic serif if the font files are not available.

## To Enable Cooper Standard Font

### Option 1: Use System Font (Easiest)
If Cooper Standard is installed on your system, it may already work. Test by reloading Foundry VTT.

### Option 2: Add Font Files (Recommended)
1. Obtain Cooper Standard font files (you'll need a license):
   - CooperStd-Black.woff2 / CooperStd-Black.woff
   - CooperStd-Bold.woff2 / CooperStd-Bold.woff

2. Place the font files in this directory:
   ```
   assets/fonts/
   ├── CooperStd-Black.woff2
   ├── CooperStd-Black.woff
   ├── CooperStd-Bold.woff2
   └── CooperStd-Bold.woff
   ```

3. Edit `src/styles/ose.scss` and uncomment the @font-face declarations (lines ~28-42)

4. Run `npm run build`

### Option 3: Use Free Alternative
If you don't have Cooper Standard, consider these free alternatives:
- **Cooper Hewitt** (similar style, free)
- **Bookman Old Style** (usually available on systems)
- **Century Schoolbook** (similar classic serif)

To use an alternative, edit `src/styles/_tabs.scss` and change:
```scss
font-family: 'Cooper Hewitt', 'Bookman Old Style', serif;
```

## Current Fallback
The tabs currently use this fallback chain:
1. 'Cooper Std'
2. 'Cooper Standard'  
3. serif (browser default serif font)

This means the tabs will display in a serif font even without the Cooper Standard files.
