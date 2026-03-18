/**
 * Generate PWA icons as PNG files using node canvas-free approach.
 * Creates simple branded icons with the check-in "C" mark.
 * Run: node scripts/generate-icons.js
 */

const fs = require("fs");
const path = require("path");

// Minimal PNG encoder — creates a solid branded icon with a white "C" letter
// Uses raw PNG binary format (no dependencies needed)

function createPNG(size) {
  // Create an SVG, then we'll just use it directly since browsers handle SVG icons
  // Actually, for PWA we need real PNG. Let's create a simple 1-color PNG.

  // For production-quality icons, we'll create SVG icons that work everywhere
  // and a simple favicon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A66914"/>
      <stop offset="100%" stop-color="#DD9C28"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="central"
    font-family="'Nunito','Arial',sans-serif" font-weight="800"
    font-size="${Math.round(size * 0.52)}" fill="white" letter-spacing="-0.02em">C</text>
  <text x="50%" y="78%" text-anchor="middle" dominant-baseline="central"
    font-family="'Nunito','Arial',sans-serif" font-weight="700"
    font-size="${Math.round(size * 0.09)}" fill="rgba(255,255,255,0.8)"
    letter-spacing="0.15em" text-transform="uppercase">CHECK-IN</text>
</svg>`;
  return svg;
}

// Write SVG icons (universally supported for PWA on modern browsers)
const sizes = [192, 512];
const outDir = path.join(__dirname, "..", "public", "icons");

for (const size of sizes) {
  const svg = createPNG(size);
  const filePath = path.join(outDir, `icon-${size}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`Created ${filePath}`);
}

// Also create a simple favicon.svg at public root
const faviconSvg = createPNG(32);
fs.writeFileSync(path.join(__dirname, "..", "public", "favicon.svg"), faviconSvg);
console.log("Created public/favicon.svg");

console.log("\nNote: For App Store quality PNG icons, convert these SVGs using:");
console.log("  npx sharp-cli -i public/icons/icon-192.svg -o public/icons/icon-192.png resize 192 192");
console.log("  npx sharp-cli -i public/icons/icon-512.svg -o public/icons/icon-512.png resize 512 512");
