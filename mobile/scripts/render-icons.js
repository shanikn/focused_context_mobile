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
//   icon.png                      the art on #DCEEDD (iOS / older Android)
//   adaptive-icon-foreground.png  transparent art for the Android adaptive icon
//   adaptive-icon-monochrome.png  one-color silhouette, sparkle cut out (Android 13+ themed icons)
//   splash-icon.png               transparent art for the light splash screen
//   splash-icon-dark.png          the same art in the dark theme's colors
//
// Sizing: launchers crop the adaptive icon to any shape (circle, squircle...),
// and only the centered 66dp circle of its 108dp canvas is always visible.
// The whole drawing is scaled to fit inside that circle with a margin, and the
// same size is used for icon.png and the monochrome icon. Android 12+ clips the
// splash icon to a circle of 192dp out of 288dp, so the splash art fits in that.
// After rendering, every pixel of the transparent PNGs is checked against its
// circle, and the script fails if any of the drawing falls outside.
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
const BACKGROUND = "#DCEEDD";

// farthest point of the drawing from the center of BOX, in art units: the
// three rounded corners (radius 80, centers 130 and 180 from the middle),
// sqrt(130² + 180²) + 80 ≈ 302. The folded corner is closer (≈ 282).
const ART_RADIUS = Math.hypot(130, 180) + 80;

const SIZE = 1024;
const MARGIN = 0.92; // the drawing reaches 92% of the safe circle's radius
const ICON_SAFE_RADIUS = (SIZE * 33) / 108; // 66dp circle on the 108dp adaptive canvas
const SPLASH_SAFE_RADIUS = (SIZE * 96) / 288; // 192dp circle on the 288dp splash canvas
const ICON_RADIUS = ICON_SAFE_RADIUS * MARGIN;
const SPLASH_RADIUS = SPLASH_SAFE_RADIUS * MARGIN;

const LIGHT = { note: "#1F7A3A", fold: "#145C2A", cutout: "#FFFFFF" };
// dark theme: the lighter green from theme.ts, the sparkle in the dark background
const DARK = { note: "#6CC48A", fold: "#3F7550", cutout: "#0F1411" };

function rendered(svgText, size = SIZE) {
  return new Resvg(svgText, { fitTo: { mode: "width", value: size } }).render();
}

function render(svgText, size = SIZE) {
  return rendered(svgText, size).asPng();
}

function recolor(g, c) {
  return g
    .replace(/fill="#1F7A3A"/g, `fill="${c.note}"`)
    .replace(/fill="#145C2A"/g, `fill="${c.fold}"`)
    .replace(/fill="#FFFFFF"/g, `fill="${c.cutout}"`);
}

// the art scaled so its farthest point is `radius` px from the canvas center
function fitted(g, radius) {
  const scale = radius / ART_RADIUS;
  const tx = SIZE / 2 - (BOX.x + BOX.w / 2) * scale;
  const ty = SIZE / 2 - (BOX.y + BOX.h / 2) * scale;
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${g}</g>`;
}

function svgDoc(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}

// one color, with the sparkle cut out: the note and fold are white in the
// mask, the sparkle black
function monochrome(color) {
  const mask = fitted(
    art.replace(/fill="#FFFFFF"/g, 'fill="#000"').replace(/fill="#(1F7A3A|145C2A)"/g, 'fill="#fff"'),
    ICON_RADIUS
  );
  return svgDoc(
    `<defs><mask id="m"><rect width="${SIZE}" height="${SIZE}" fill="#000"/>${mask}</mask></defs>` +
      `<rect width="${SIZE}" height="${SIZE}" fill="${color}" mask="url(#m)"/>`
  );
}

// throws if any visible pixel of a transparent PNG lies outside the circle
function checkInside(name, svgText, safeRadius) {
  const image = rendered(svgText);
  const { width, height, pixels } = image;
  let farthest = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        farthest = Math.max(farthest, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
      }
    }
  }
  if (farthest > safeRadius) {
    throw new Error(`${name}: drawing reaches ${farthest.toFixed(1)}px, safe circle is ${safeRadius.toFixed(1)}px`);
  }
  return `${((farthest / safeRadius) * 100).toFixed(0)}% of the safe radius`;
}

const foreground = svgDoc(fitted(art, ICON_RADIUS));
const outputs = {
  "icon.png": svgDoc(`<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>${fitted(art, ICON_RADIUS)}`),
  "adaptive-icon-foreground.png": foreground,
  "adaptive-icon-monochrome.png": monochrome("#000000"),
  "splash-icon.png": svgDoc(fitted(recolor(art, LIGHT), SPLASH_RADIUS)),
  "splash-icon-dark.png": svgDoc(fitted(recolor(art, DARK), SPLASH_RADIUS)),
};
const safeRadius = {
  "adaptive-icon-foreground.png": ICON_SAFE_RADIUS,
  "adaptive-icon-monochrome.png": ICON_SAFE_RADIUS,
  "splash-icon.png": SPLASH_SAFE_RADIUS,
  "splash-icon-dark.png": SPLASH_SAFE_RADIUS,
};

for (const [name, doc] of Object.entries(outputs)) {
  const check = safeRadius[name] ? `  (reaches ${checkInside(name, doc, safeRadius[name])})` : "";
  fs.writeFileSync(path.join(ASSETS, name), render(doc));
  console.log(`wrote assets/${name}${check}`);
}

// a superellipse, close to the squircle mask Samsung and Pixel launchers use
function squirclePath(cx, cy, r, n = 5, steps = 120) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    points.push(
      `${(cx + r * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)},${(cy + r * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`
    );
  }
  return `M${points.join(" L")} Z`;
}

if (process.argv.includes("--preview")) {
  const dir = path.join(__dirname, "icon-previews");
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [192, 48]) {
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), render(outputs["icon.png"], size));
  }
  // the adaptive icon as a launcher shows it: background + foreground, the
  // middle 72dp of the 108dp canvas, cropped to a shape
  const visible = (SIZE * 72) / 108;
  const offset = (SIZE - visible) / 2;
  const launcher = (clip, extra = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${offset} ${offset} ${visible} ${visible}" width="${SIZE}" height="${SIZE}">` +
    `<defs><clipPath id="c">${clip}</clipPath></defs>` +
    `<g clip-path="url(#c)"><rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>${fitted(art, ICON_RADIUS)}${extra}</g></svg>`;
  const circle = `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${visible / 2}"/>`;
  const squircle = `<path d="${squirclePath(SIZE / 2, SIZE / 2, visible / 2)}"/>`;
  const safeOutline = `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${ICON_SAFE_RADIUS}" fill="none" stroke="#E53935" stroke-width="4" stroke-dasharray="14 10"/>`;
  fs.writeFileSync(path.join(dir, "adaptive-circle-192.png"), render(launcher(circle), 192));
  fs.writeFileSync(path.join(dir, "adaptive-squircle-192.png"), render(launcher(squircle), 192));
  fs.writeFileSync(path.join(dir, "adaptive-safe-zone-384.png"), render(launcher(squircle, safeOutline), 384));
  // the dark splash as it appears: art on the dark background
  fs.writeFileSync(
    path.join(dir, "splash-dark-192.png"),
    render(svgDoc(`<rect width="${SIZE}" height="${SIZE}" fill="${DARK.cutout}"/>${fitted(recolor(art, DARK), SPLASH_RADIUS)}`), 192)
  );
  console.log(`previews in scripts/icon-previews/`);
}
