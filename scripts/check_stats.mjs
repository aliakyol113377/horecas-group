import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('data/products.json');
const raw = fs.readFileSync(file, 'utf8');
const products = JSON.parse(raw);

let total = products.length;
let zero = 0;
let gt1 = 0;
let missing = 0;
for (const p of products) {
  if (!('images' in p)) { missing++; zero++; continue; }
  const imgs = Array.isArray(p.images) ? p.images : [];
  if (imgs.length === 0) zero++;
  else if (imgs.length > 1) gt1++;
}
const result = { total, zeroImages: zero, moreThanOneImage: gt1, missingImagesField: missing };
console.log(JSON.stringify(result, null, 2));
