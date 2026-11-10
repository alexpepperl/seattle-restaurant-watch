import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICE_SOURCES, normalizeCrime, normalizeCalls, collectPolice, queryFor } from '../scripts/police.mjs';

const now = new Date('2026-11-10T23:00:00Z');
const crime = (extra = {}) => ({
  report_number: '2026-EXAMPLE', offense_id: 'offense-1', offense_date: '2026-11-07T04:30:00.000',
  report_date_time: '2026-11-08T10:00:00.000', nibrs_offense_code: '220',
  neighborhood: 'BALLARD NORTH', beat: 'J2', block_address: '24XX BLOCK OF NW 80TH ST', latitude: '47.6867', longitude: '-122.3881',
  ...extra
});
const call = (extra = {}) => ({
  cad_event_number: 'CAD-EXAMPLE', cad_event_original_time_queued: '2026-11-07T04:30:00.000',
  initial_call_type: 'BURGLARY - RESIDENTIAL', final_call_type: 'BURGLARY - NON RESIDENTIAL/COMMERCIAL',
  cad_event_clearance_description: 'REPORT WRITTEN', dispatch_neighborhood: 'BALLARD NORTH', dispatch_beat: 'J2',
  ...extra
});
const meta = source => ({ rowsUpdatedAt: 1794328047, columns: source.fields.map(fieldName => ({ fieldName })) });
const response = json => ({ ok: true, json: async () => json });
function mockFetcher({ changing = false, endless = false } = {}) {
  const calls = [];
  const metadataReads = new Map();
  const fetcher = async value => {
    const url = new URL(value);
    calls.push(url);
    const source = POLICE_SOURCES.find(source => url.pathname.includes(source.dataset));
    if (url.pathname.startsWith('/api/views/')) {
      const count = (metadataReads.get(source.id) || 0) + 1;
      metadataReads.set(source.id, count);
      return response({ ...meta(source), rowsUpdatedAt: meta(source).rowsUpdatedAt + (changing && count > 1 ? 1 : 0) });
    }
    const row = source.id === 'crime' ? crime() : call();
    return response(endless || url.searchParams.get('$offset') === '0' ? [row] : []);
  };
  return { fetcher, calls };
}
test('crime rows deduplicate report and offense ids without identifying a restaurant', () => {
  const records = normalizeCrime([crime(), crime(), crime({ offense_id: 'offense-2' })]);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].offenseIds, ['offense-1', 'offense-2']);
  assert.deepEqual(records[0].point, [47.6867, -122.3881]);
  assert.equal('restaurant' in records[0], false);
  assert.equal(records[0].dateBasis, 'Offense date');
});
test('redacted, ambiguous and invalid coordinates are never reverse-engineered', () => {
  assert.equal(normalizeCrime([crime({ latitude: 'REDACTED', longitude: 'REDACTED', block_address: 'REDACTED' })])[0].point, null);
  assert.equal(normalizeCrime([crime(), crime({ offense_id: 'two', latitude: '47.68' })])[0].point, null);
  assert.equal(normalizeCrime([crime({ latitude: '0', longitude: '0' })])[0].point, null);
  assert.equal(normalizeCrime([crime({ offense_date: undefined })])[0].dateBasis, 'Includes report-date fallback');
});
test('CAD officer rows deduplicate by event; initial and final classifications stay distinct', () => {
  const records = normalizeCalls([call(), call({ dispatch_latitude: '47.68', dispatch_longitude: '-122.38' }), call({ cad_event_clearance_description: 'NO REPORT WRITTEN' })]);
  assert.equal(records.length, 1);
  assert.equal(records[0].commercial, true);
  assert.equal(records[0].clearances.length, 2);
  assert.equal('point' in records[0], false);
  assert.equal('dispatch_latitude' in records[0], false);
  assert.equal(normalizeCalls([call({ initial_call_type: 'BURGLARY - COMMERCIAL', final_call_type: 'BURGLARY - RESIDENTIAL' })])[0].commercial, false);
});
test('invalid rows fail explicitly instead of silently publishing partial data', () => {
  assert.throws(() => normalizeCrime([crime({ offense_id: undefined })]), /schema/);
  assert.throws(() => normalizeCrime([crime({ neighborhood: 'FREMONT' })]), /geography/);
  assert.throws(() => normalizeCalls([call({ cad_event_original_time_queued: 'bad' })]), /Invalid/);
});
test('queries use official Ballard neighborhood labels, bounded dates and burglary classifications', () => {
  for (const source of POLICE_SOURCES) {
    const query = queryFor(source, now);
    assert.match(query, /BALLARD NORTH','BALLARD SOUTH/);
    assert.match(query, /2025-01-01/);
    assert.match(query, /2026-11-11/);
    assert.match(query, source.id === 'crime' ? /nibrs_offense_code='220'/ : /upper\(final_call_type\)/);
  }
});
test('police collection paginates until completion and records the source update time separately', async () => {
  const { fetcher, calls } = mockFetcher();
  const result = await collectPolice({}, { fetcher, now, pageSize: 1 });
  assert.equal(result.crime.status, 'ok');
  assert.equal(result.calls.status, 'ok');
  assert.equal(result.crime.records.length, 1);
  assert.equal(result.calls.records.length, 1);
  assert.notEqual(result.crime.sourceUpdatedAt, result.crime.lastSuccessAt);
  assert.ok(calls.some(url => url.searchParams.get('$offset') === '1'));
  assert.ok(calls.filter(url => url.pathname.includes('33kz-ixgy') && url.pathname.includes('/resource/')).every(url => url.searchParams.get('$select').startsWith('distinct ')));
});
test('snapshot source order stays stable when calls finish before crime reports', async () => {
  const { fetcher } = mockFetcher();
  let releaseCrime;
  const callsFinished = new Promise(resolve => { releaseCrime = resolve; });
  let callsMetadataReads = 0;
  const result = await collectPolice({}, {
    now,
    fetcher: async url => {
      if (String(url).includes('tazs-3rd5')) await callsFinished;
      const response = await fetcher(url);
      if (String(url).includes('/api/views/33kz-ixgy') && ++callsMetadataReads === 2) releaseCrime();
      return response;
    },
  });
  assert.equal(result.crime.status, 'ok');
  assert.equal(result.calls.status, 'ok');
  assert.deepEqual(Object.keys(result).slice(-2), ['crime', 'calls']);
});
test('failed API checks preserve the previous complete snapshot and last success', async () => {
  const old = { records: normalizeCrime([crime()]), lastSuccessAt: '2026-11-09T00:00:00Z' };
  const result = await collectPolice({ crime: old }, { fetcher: async () => ({ ok: false, status: 503 }), wait: async () => {}, now });
  assert.equal(result.crime.status, 'error');
  assert.equal(result.crime.error, 'HTTP 503');
  assert.equal(result.crime.lastSuccessAt, old.lastSuccessAt);
  assert.deepEqual(result.crime.records, old.records);
});
test('a changing dataset and pagination cap are failures, not complete success-shaped counts', async () => {
  for (const options of [{ changing: true }, { endless: true }]) {
    const { fetcher } = mockFetcher(options);
    const result = await collectPolice({}, { fetcher, now, pageSize: 1 });
    assert.equal(result.crime.status, 'error');
    assert.equal(result.calls.status, 'error');
    assert.match(result.crime.error, options.changing ? /changed during pagination/ : /pagination limit/);
    assert.equal(result.crime.records.length, 0);
  }
});
