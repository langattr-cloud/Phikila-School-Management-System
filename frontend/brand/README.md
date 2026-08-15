# Brand artwork generators

The Phikila logo, app icons and favicons are generated from source rather than
hand-edited, so every asset stays consistent and reproducible.

- `build.mjs` — draws the vector artwork (mark, lockups, app icon, favicon) and
  converts the wordmark to outlines. Writes SVGs to `out/`.
- `export.mjs` — rasterises `out/` into the PNG sizes browsers, iOS, Android and
  PWA installers need, and assembles the multi-resolution `favicon.ico`.

## Regenerating

These scripts are build-time tooling and are intentionally **not** dependencies
of the application. Install them ad hoc:

```bash
cd frontend/brand
npm init -y
npm i opentype.js sharp wawoff2 @fontsource/inter

# decompress the Inter woff2 files to TTF for opentype.js
node -e "const fs=require('fs'),w=require('wawoff2');(async()=>{for(const wt of [600,700]){
  const b=fs.readFileSync('node_modules/@fontsource/inter/files/inter-latin-'+wt+'-normal.woff2');
  fs.writeFileSync('inter-'+wt+'.ttf', Buffer.from(await w.decompress(b)));}})()"

node build.mjs
node export.mjs ../public/brand
mv ../public/brand/favicon.ico ../public/favicon.ico
cp out/favicon.svg ../public/favicon.svg
```

Design rationale, palette, and usage rules live in `../public/brand/README.md`.
