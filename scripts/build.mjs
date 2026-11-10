import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
await mkdir(out, { recursive: true });
await cp(join(root, 'public'), out, { recursive: true });
await mkdir(join(out, 'vendor', 'leaflet'), { recursive: true });
await cp(join(root, 'node_modules', 'leaflet', 'dist'), join(out, 'vendor', 'leaflet'), { recursive: true });
JSON.parse(await readFile(join(out, 'data', 'incidents.json'), 'utf8'));
JSON.parse(await readFile(join(out, 'data', 'monitor.json'), 'utf8'));
JSON.parse(await readFile(join(out, 'data', 'police.json'), 'utf8'));
JSON.parse(await readFile(join(out, 'data', 'sources.json'), 'utf8'));
await writeFile(join(out, '.nojekyll'), '');
console.log(`Built static website in ${out}`);
