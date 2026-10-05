#!/usr/bin/env node
// Renders assets/icon.svg into the app's icon and splash PNGs (all 1024x1024).
// The icon ("smart note"): a green note (#1F7A3A) with a darker folded
// top-right corner (#145C2A) and a white four-point sparkle (#FFFFFF) in the
// middle, on #DCEEDD.
//
//   npm run icons            write the PNGs into assets/
//   npm run icons -- --preview   also write small previews into scripts/icon-previews/
//
// Outputs:
//   icon.png                      full-bleed icon on #DCEEDD (iOS / older Android)
//   adaptive-icon-foreground.png  transparent, art inside the middle 66% (Android adaptive icon)
//   adaptive-icon-monochrome.png  one-color silhouette, sparkle cut out (Android 13+ themed icons)
//   splash-icon.png               transparent art for the light splash screen
//                                 (inside the middle 66%: Android clips the splash icon to a circle)
//   splash-icon-dark.png          the same art in the dark theme's colors
//
// The art is the <g id="art"> group in icon.svg (no nested groups); BOX is
// its bounding box in its own coordinates.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const ASSETS = path.join(__dirname, "..", "assets");
const svg = fs.readFileSync(path.join(ASSETS, "icon.svg"), "utf8");
const art = svg.match(/<g id="art">[\s\S]*?<\/g>/)[0];
const BOX = { x: 302, y: 252, w: 420, h: 520 };

const LIGHT = { note: "#1F7A3A", fold: "#145C2A", cutout: "#FFFFFF" };
// dark theme: the lighter green from theme.ts, the sparkle in the dark background
const DARK = { note: "#6CC48A", fold: "#3F7550", cutout: "#0F1411" };

function render(svgText, size = 1024) {
  return new Resvg(svgText, { fitTo: { mode: "width", value: size } }).render().asPng();
}

function recolor(g, c) {
  return g
    .replace(/fill="#1F7A3A"/g, `fill="${c.note}"`)
    .replace(/fill="#145C2A"/g, `fill="${c.fold}"`)
    .replace(/fill="#FFFFFF"/g, `fill="${c.cutout}"`);
}

// the art scaled to fit `fraction` of the canvas, centered, on a transparent background
function centered(g, fraction) {
  const room = 1024 * fraction;
  const scale = Math.min(room / BOX.w, room / BOX.h);
  const tx = 512 - (BOX.x + BOX.w / 2) * scale;
  const ty = 512 - (BOX.y + BOX.h / 2) * scale;
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${g}</g>`;
}

function svgDoc(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;
}

// one color, with the sparkle cut out: the note and fold are white in the
// mask, the sparkle black
function monochrome(color) {
  const mask = centered(
    art.replace(/fill="#FFFFFF"/g, 'fill="#000"').replace(/fill="#(1F7A3A|145C2A)"/g, 'fill="#fff"'),
    0.66
  );
  return svgDoc(
    `<defs><mask id="m"><rect width="1024" height="1024" fill="#000"/>${mask}</mask></defs>` +
      `<rect width="1024" height="1024" fill="${color}" mask="url(#m)"/>`
  );
}

const outputs = {
  "icon.png": svg,
  "adaptive-icon-foreground.png": svgDoc(centered(art, 0.66)),
  "adaptive-icon-monochrome.png": monochrome("#000000"),
  "splash-icon.png": svgDoc(centered(recolor(art, LIGHT), 0.66)),
  "splash-icon-dark.png": svgDoc(centered(recolor(art, DARK), 0.66)),
};

for (const [name, doc] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(ASSETS, name), render(doc));
  console.log(`wrote assets/${name}`);
}

if (process.argv.includes("--preview")) {
  const dir = path.join(__dirname, "icon-previews");
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [192, 48]) {
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), render(svg, size));
  }
  // the dark splash as it appears: art on the dark background
  fs.writeFileSync(
    path.join(dir, "splash-dark-192.png"),
    render(svgDoc(`<rect width="1024" height="1024" fill="${DARK.cutout}"/>${centered(recolor(art, DARK), 0.5)}`), 192)
  );
  console.log(`previews in scripts/icon-previews/`);
}
