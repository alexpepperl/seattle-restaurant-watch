import { readFile, writeFile } from 'node:fs/promises';
import { collectFeeds } from './feeds.mjs';

const path = new URL('../public/data/monitor.json', import.meta.url);
const previous = JSON.parse(await readFile(path, 'utf8'));
const next = await collectFeeds(previous);
await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
let failed = false;
for (const feed of next.feeds) {
  if (feed.status === 'error') { console.error(`::error::${feed.name}: ${feed.error}`); failed = true; }
  else console.log(`${feed.name}: checked successfully`);
  for (const warning of feed.warnings) console.warn(`::warning::${feed.name}: ${warning}`);
}
console.log(`${next.leads.length} retained headlines. No incidents automatically added to the map.`);
if (failed) process.exitCode = 1;
