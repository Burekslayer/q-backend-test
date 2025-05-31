// generate_swatches.js
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs').promises;

// Convert H (0–360), S,V (0–1) → RGB (0–255)
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0,0,0];
  if (h < 60)      [r, g, b] = [c, x, 0];
  else if (h < 120)[r, g, b] = [x, c, 0];
  else if (h < 180)[r, g, b] = [0, c, x];
  else if (h < 240)[r, g, b] = [0, x, c];
  else if (h < 300)[r, g, b] = [x, 0, c];
  else             [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

async function makeSwatches({
  count = 50,
  size  = 200,
  outDir= './swatches'
} = {}) {
  // ensure output directory exists
  await fs.mkdir(outDir, { recursive: true });

  // generate evenly spaced hues
  const hues = Array.from({ length: count }, (_, i) =>
    Math.round(i * (360 / count))
  );

  await Promise.all(
    hues.map(async (hue) => {
      const [r, g, b] = hsvToRgb(hue, 1, 1);
      const filename = path.join(outDir, `swatch_${hue}.png`);

      await sharp({
        create: {
          width:  size,
          height: size,
          channels: 3,
          background: { r, g, b }
        }
      })
      .png()
      .toFile(filename);

      console.log(`✔️  Created ${filename}`);
    })
  );
}

makeSwatches().catch(err => {
  console.error('Error generating swatches:', err);
  process.exit(1);
});
