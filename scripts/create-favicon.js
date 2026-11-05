import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const imgPath = path.join(root, 'public', 'images', 'agi', 'agi-image-2.png');
const buf = fs.readFileSync(imgPath);
const base64 = buf.toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <clipPath id="circleClip">
      <circle cx="32" cy="32" r="32" />
    </clipPath>
  </defs>
  <circle cx="32" cy="32" r="32" fill="#ffffff" />
  <g clip-path="url(#circleClip)">
    <image href="data:image/png;base64,${base64}" x="7" y="7" width="50" height="50" preserveAspectRatio="xMidYMid meet" />
  </g>
  <circle cx="32" cy="32" r="31" fill="none" stroke="#e2e8f0" stroke-width="1.5" />
</svg>`;

fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), svg.trim());
console.log('Successfully generated public/favicon.svg');
