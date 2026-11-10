import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterIncidents, filterPolice, summarize, monthlyCounts, rangeForPeriod, escapeHTML, safeURL, toCSV } from '../public/domain.js';
import { FEEDS } from '../scripts/feeds.mjs';

const data = JSON.parse(await readFile(new URL('../public/data/incidents.json', import.meta.url)));
test('all starting reports have valid, unique ids, source references, dates and Seattle map points', () => {
  assert.equal(new Set(data.incidents.map(item => item.id)).size, data.incidents.length);
  assert.equal(new Set(data.locations.map(item => item.id)).size, data.locations.length);
  for (const item of data.incidents) {
    assert.ok(data.sources[item.sourceId]);
    assert.match(data.sources[item.sourceId].url, /^https:\/\//);
    const location = data.locations.find(location => location.id === item.locationId);
    assert.ok(location);
    assert.ok(location.lat > 47.49 && location.lat < 47.74);
    assert.ok(location.lng > -122.46 && location.lng < -122.23);
    for (const date of [item.start, item.end, data.sources[item.sourceId].published]) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10), date);
    }
    for (const location of data.locations) {
      if (location.status === 'closure-reported') assert.ok(data.sources[location.statusSourceId]);
    }
    assert.ok(item.start <= item.end);
    assert.ok(item.end <= data.sources[item.sourceId].published);
    if (item.cost) {
      assert.ok(item.cost.min >= 0);
      assert.ok(item.cost.max === null || item.cost.max >= item.cost.min);
    }
  }
});
test('totals count shared premises once, repeats and lower costs without upper-only estimates', () => {
  const stats = summarize(data.incidents);
  assert.equal(stats.incidents, 18);
  assert.equal(stats.locations, 15);
  assert.equal(stats.repeats, 2);
  assert.equal(stats.cost, 47600);
  assert.equal(stats.costCount, 8);
  assert.equal(stats.moreThan, true);
});
test('30 day preset is inclusive and based on today rather than the newest report', () => {
  const range = rangeForPeriod('30', new Date('2026-11-10T20:00:00Z'));
  assert.deepEqual(range, { start: '2026-10-12', end: '2026-11-10' });
  const matches = filterIncidents(data, range);
  assert.deepEqual(matches.map(item => item.id), ['salehs-nov26']);
  assert.equal(summarize(matches).repeats, 0);
});
test('date filters include overlapping uncertain ranges but exclude non-overlaps', () => {
  const matches = filterIncidents(data, { start: '2026-02-01', end: '2026-02-01' });
  assert.deepEqual(new Set(matches.map(item => item.id)), new Set(['copine-early26', 'seattle-biscuit-early26']));
  assert.equal(filterIncidents(data, { start: '2027-01-01', end: '2027-12-31' }).length, 0);
});
test('neighborhood, type and normalized search filters combine', () => {
  const matches = filterIncidents(data, { neighborhood: 'Ballard', type: 'attempt', query: ' SALEH ' });
  assert.deepEqual(matches.map(item => item.id), ['salehs-nov26']);
  assert.equal(filterIncidents(data, { neighborhood: 'Alki', query: 'nonexistent' }).length, 0);
});
test('monthly bars never invent a month for cross-month uncertain dates', () => {
  const chart = monthlyCounts(data.incidents, '', '');
  assert.equal(chart.uncertain, 2);
  assert.equal(chart.months.reduce((sum, month) => sum + month.count, 0) + chart.uncertain, 18);
  assert.equal(chart.months.find(month => month.key === '2026-02').count, 3);
  assert.equal(chart.months.find(month => month.key === '2026-04').count, 3);
  assert.deepEqual(monthlyCounts([], '', ''), { months: [], uncertain: 0 });
});
test('display escaping and URL guards exclude injected markup and unsafe protocols', () => {
  assert.equal(escapeHTML('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
  assert.equal(safeURL('javascript:alert(1)'), '#');
  assert.equal(safeURL('http://example.com'), '#');
  assert.equal(safeURL('not a url'), '#');
  assert.equal(safeURL('https://example.com/'), 'https://example.com/');
});
test('Ballard pilot remains distinct from retained Seattle sample and police records', () => {
  const pilot = filterIncidents(data, { neighborhood: 'Ballard' });
  assert.equal(pilot.length, 14);
  assert.equal(summarize(pilot).locations, 13);
  assert.equal(summarize(pilot).cost, 46600);
  assert.ok(pilot.every(incident => !('reportNumber' in incident)));
});
test('source directory declares real feed ids and access limitations without duplicate entries', async () => {
  const directory = JSON.parse(await readFile(new URL('../public/data/sources.json', import.meta.url)));
  assert.equal(new Set(directory.sources.map(source => source.id)).size, directory.sources.length);
  assert.equal(FEEDS.length, 9);
  for (const source of directory.sources) {
    assert.ok(['official', 'reporting', 'social', 'community'].includes(source.category));
    assert.notEqual(safeURL(source.url), '#');
    for (const id of source.feedIds || []) assert.ok(FEEDS.some(feed => feed.id === id));
  }
  assert.ok(directory.sources.filter(source => source.category === 'social').every(source => source.access !== 'automatic'));
});
test('police search, commercial classification and date overlap are independent filters', () => {
  const records = [
    { id: 'one', start: '2026-01-01', end: '2026-01-03', neighborhoods: ['BALLARD NORTH'], beats: ['J2'], blocks: ['24XX BLOCK OF NW 80TH ST'], commercial: false },
    { id: 'two', start: '2026-04-01', end: '2026-04-01', neighborhoods: ['BALLARD SOUTH'], beats: ['B2'], commercial: true }
  ];
  assert.deepEqual(filterPolice(records, { start: '2026-01-02', end: '2026-01-02', query: '80TH' }).map(record => record.id), ['one']);
  assert.deepEqual(filterPolice(records, { commercialOnly: true }).map(record => record.id), ['two']);
  assert.deepEqual(filterPolice(records, { query: 'not a business attribution' }), []);
});
test('CSV preserves a proper quoted shape and neutralizes spreadsheet formulas', () => {
  const csv = toCSV(['Name', 'Value'], [['Comma, and "quotes"', 'line\nbreak'], [' =HYPERLINK("bad")', '@SUM(1)']]);
  assert.ok(csv.startsWith('\uFEFF"Name","Value"\r\n'));
  assert.ok(csv.includes('"Comma, and ""quotes""","line\nbreak"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""bad"")","\'@SUM(1)"'));
});
