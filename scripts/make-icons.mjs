// Regenerates the PNG icons from public/icons/icon.svg (requires `npm i -D sharp`).
import sharp from 'sharp';
for (const size of [16, 48, 128]) {
  await sharp('public/icons/icon.svg', { density: 384 }).resize(size, size).png().toFile(`public/icons/icon${size}.png`);
}
console.log('icons written');
