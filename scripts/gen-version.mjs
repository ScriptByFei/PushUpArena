import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const version = { v: Date.now() };
writeFileSync(
  resolve(__dirname, '../public/version.json'),
  JSON.stringify(version)
);
console.log('version.json written:', version);
