import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'images', 'presets');

// Quality per preset — tuned to hit ≤60KB WebP / ≤80KB JPEG
const PRESETS = [
  { name: 'city',   webpQ: 55, jpgQ: 60 },
  { name: 'people', webpQ: 65, jpgQ: 65 },
  { name: 'nature', webpQ: 65, jpgQ: 65 },
  { name: 'cafe',   webpQ: 65, jpgQ: 65 },
  { name: 'tech',   webpQ: 65, jpgQ: 65 },
];

for (const { name, webpQ, jpgQ } of PRESETS) {
  const src = path.join(DIR, `${name}.jpg`);
  const webpOut = path.join(DIR, `${name}.webp`);
  const jpgOut  = path.join(DIR, `${name}-opt.jpg`);
  await sharp(src).resize(828, 410, { fit: 'cover' }).webp({ quality: webpQ }).toFile(webpOut);
  await sharp(src).resize(828, 410, { fit: 'cover' }).jpeg({ quality: jpgQ }).toFile(jpgOut);
  console.log(`✓ ${name}.webp + ${name}-opt.jpg`);
}
