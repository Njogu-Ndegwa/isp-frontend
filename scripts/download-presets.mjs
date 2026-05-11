import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'images', 'presets');

mkdirSync(OUT_DIR, { recursive: true });

const PRESETS = [
  { name: 'city',   url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=828&h=410&fit=crop&q=80&fm=jpg' },
  { name: 'people', url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=828&h=410&fit=crop&q=80&fm=jpg' },
  { name: 'nature', url: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=828&h=410&fit=crop&q=80&fm=jpg' },
  { name: 'cafe',   url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=828&h=410&fit=crop&q=80&fm=jpg' },
  { name: 'tech',   url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=828&h=410&fit=crop&q=80&fm=jpg' },
];

for (const { name, url } of PRESETS) {
  const outPath = path.join(OUT_DIR, `${name}.jpg`);
  console.log(`Downloading ${name}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(outPath));
  console.log(`  ✓ ${outPath}`);
}
console.log('Done.');
