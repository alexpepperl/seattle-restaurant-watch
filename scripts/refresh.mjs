import { readFile, writeFile } from 'node:fs/promises';
import { collectFeeds } from './feeds.mjs';
import { collectPolice } from './police.mjs';

const path = new URL('../public/data/monitor.json', import.meta.url);
const policePath = new URL('../public/data/police.json', import.meta.url);
const previous = JSON.parse(await readFile(path, 'utf8'));
const previousPolice = JSON.parse(await readFile(policePath, 'utf8'));
const [next, police] = await Promise.all([collectFeeds(previous), collectPolice(previousPolice)]);
await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
await writeFile(policePath, `${JSON.stringify(police, null, 2)}\n`);
let failed = false;
for (const feed of next.feeds) {
  if (feed.status === 'error') { console.error(`::error::${feed.name}: ${feed.error}`); failed = true; }
  else console.log(`${feed.name}: checked successfully`);
  for (const warning of feed.warnings) console.warn(`::warning::${feed.name}: ${warning}`);
}
console.log(`${next.leads.length} retained headlines. No incidents automatically added to the map.`);
for (const source of [police.crime, police.calls]) {
  if (source.status === 'error') { console.error(`::error::${source.name}: ${source.error}`); failed = true; }
  else console.log(`${source.name}: ${source.records.length} distinct records from ${source.sourceRowCount} source rows`);
}
if (failed) process.exitCode = 1;
