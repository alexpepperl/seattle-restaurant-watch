import { fetchWithRetry } from './http.mjs';

export const SINCE = '2025-01-01';
export const AREAS = ['BALLARD NORTH', 'BALLARD SOUTH'];
export const POLICE_SOURCES = [
  {
    id: 'crime', dataset: 'tazs-3rd5', name: 'SPD approved burglary reports',
    fields: ['report_number', 'offense_id', 'offense_date', 'report_date_time', 'block_address', 'latitude', 'longitude', 'neighborhood', 'beat', 'nibrs_offense_code'],
    order: 'offense_date DESC,report_number,offense_id'
  },
  {
    id: 'calls', dataset: '33kz-ixgy', name: 'SPD burglary-related calls for service',
    fields: ['cad_event_number', 'cad_event_original_time_queued', 'initial_call_type', 'final_call_type', 'cad_event_clearance_description', 'dispatch_neighborhood', 'dispatch_beat'],
    order: 'cad_event_original_time_queued DESC,cad_event_number,final_call_type,initial_call_type,cad_event_clearance_description,dispatch_neighborhood,dispatch_beat'
  }
];
const text = value => typeof value === 'string' ? value.trim() : '';
const usable = value => text(value) && !['-', 'REDACTED', 'UNKNOWN'].includes(text(value).toUpperCase());
function date(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value || '') || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid or missing ${field}`);
  return value;
}
const unique = values => [...new Set(values.filter(usable))].sort();
export function recordURL(kind, id) {
  const source = POLICE_SOURCES.find(source => source.id === kind);
  const url = new URL(`https://data.seattle.gov/resource/${source.dataset}.json`);
  const field = kind === 'crime' ? 'report_number' : 'cad_event_number';
  url.searchParams.set('$where', `${field}='${id.replaceAll("'", "''")}'`);
  url.searchParams.set('$select', source.fields.join(','));
  return url.href;
}

export function normalizeCrime(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!usable(row.report_number) || !usable(row.offense_id) || row.nibrs_offense_code !== '220' || !AREAS.includes(row.neighborhood)) throw new Error('Unexpected SPD burglary row schema or geography');
    date(row.report_date_time, 'report_date_time');
    if (row.offense_date) date(row.offense_date, 'offense_date');
    const list = grouped.get(row.report_number) || [];
    list.push(row);
    grouped.set(row.report_number, list);
  }
  return [...grouped].map(([id, entries]) => {
    const dates = entries.map(row => row.offense_date || row.report_date_time).sort();
    const points = new Map();
    for (const row of entries) {
      const lat = usable(row.latitude) ? Number(row.latitude) : NaN;
      const lng = usable(row.longitude) ? Number(row.longitude) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 47.49 && lat < 47.74 && lng > -122.46 && lng < -122.23 && usable(row.block_address)) points.set(`${lat},${lng}`, [lat, lng]);
    }
    const anyRedacted = entries.some(row => !usable(row.block_address) || !usable(row.latitude) || !usable(row.longitude));
    return {
      id, start: dates[0].slice(0, 10), end: dates.at(-1).slice(0, 10),
      dateBasis: entries.some(row => !row.offense_date) ? 'Includes report-date fallback' : 'Offense date',
      reportedAt: entries.map(row => row.report_date_time).sort().at(-1),
      offenseIds: unique(entries.map(row => row.offense_id)),
      neighborhoods: unique(entries.map(row => row.neighborhood)), beats: unique(entries.map(row => row.beat)),
      blocks: unique(entries.map(row => row.block_address)),
      point: !anyRedacted && points.size === 1 ? [...points.values()][0] : null,
      classification: 'Burglary / Breaking & Entering · premises type not supplied',
      sourceURL: recordURL('crime', id)
    };
  }).sort((a, b) => b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
}

export function normalizeCalls(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!usable(row.cad_event_number) || !AREAS.includes(row.dispatch_neighborhood)) throw new Error('Unexpected SPD call row schema or geography');
    date(row.cad_event_original_time_queued, 'cad_event_original_time_queued');
    if (!/BURGL/i.test(`${row.initial_call_type} ${row.final_call_type}`)) throw new Error('Non-burglary call in response');
    const list = grouped.get(row.cad_event_number) || [];
    list.push(row);
    grouped.set(row.cad_event_number, list);
  }
  return [...grouped].map(([id, entries]) => {
    const dates = entries.map(row => row.cad_event_original_time_queued).sort();
    const finalTypes = unique(entries.map(row => row.final_call_type));
    return {
      id, start: dates[0].slice(0, 10), end: dates.at(-1).slice(0, 10), queuedAt: dates[0],
      dateBasis: 'Call queued date · not a verified offense date',
      neighborhoods: unique(entries.map(row => row.dispatch_neighborhood)), beats: unique(entries.map(row => row.dispatch_beat)),
      initialTypes: unique(entries.map(row => row.initial_call_type)), finalTypes,
      clearances: unique(entries.map(row => row.cad_event_clearance_description)),
      commercial: finalTypes.some(type => /NON[\s-]*RESIDENTIAL|COMMERCIAL/i.test(type)),
      sourceURL: recordURL('calls', id)
    };
  }).sort((a, b) => b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
}

export function queryFor(source, now) {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const upper = tomorrow.toISOString().slice(0, 10);
  const area = `${source.id === 'crime' ? 'neighborhood' : 'dispatch_neighborhood'} in ('BALLARD NORTH','BALLARD SOUTH')`;
  if (source.id === 'crime') return `${area} AND nibrs_offense_code='220' AND ((offense_date >= '${SINCE}T00:00:00' AND offense_date < '${upper}T00:00:00') OR (offense_date is null AND report_date_time >= '${SINCE}T00:00:00' AND report_date_time < '${upper}T00:00:00'))`;
  return `${area} AND cad_event_original_time_queued >= '${SINCE}T00:00:00' AND cad_event_original_time_queued < '${upper}T00:00:00' AND (upper(initial_call_type) like '%BURGL%' OR upper(final_call_type) like '%BURGL%')`;
}

export async function collectPolice(previous, { fetcher = fetch, now = new Date(), wait, pageSize = 1000 } = {}) {
  const result = { since: SINCE, areas: AREAS, lastCheckedAt: now.toISOString() };
  const snapshots = await Promise.all(POLICE_SOURCES.map(async source => {
    const old = previous[source.id] || { records: [] };
    const metadataURL = `https://data.seattle.gov/api/views/${source.dataset}.json`;
    const get = async url => {
      const { response } = await fetchWithRetry(url, { fetcher, wait });
      return response.json();
    };
    try {
      const meta = await get(metadataURL);
      if (!Number.isFinite(meta.rowsUpdatedAt) || !Array.isArray(meta.columns) || source.fields.some(field => !meta.columns.some(column => column.fieldName === field))) throw new Error('Official dataset schema changed; manual review required');
      const query = queryFor(source, now);
      const rows = [];
      let completed = false;
      for (let page = 0; page < 50; page++) {
        const url = new URL(`https://data.seattle.gov/resource/${source.dataset}.json`);
        url.searchParams.set('$select', `${source.id === 'calls' ? 'distinct ' : ''}${source.fields.join(',')}`);
        url.searchParams.set('$where', query);
        url.searchParams.set('$order', source.order);
        url.searchParams.set('$limit', String(pageSize));
        url.searchParams.set('$offset', String(page * pageSize));
        const batch = await get(url);
        if (!Array.isArray(batch)) throw new Error('Official API returned a non-array response');
        rows.push(...batch);
        if (batch.length < pageSize) { completed = true; break; }
      }
      if (!completed) throw new Error('Police pagination limit reached; refusing to publish incomplete counts');
      const after = await get(metadataURL);
      if (meta.rowsUpdatedAt !== after.rowsUpdatedAt) throw new Error('Dataset changed during pagination; previous complete snapshot retained');
      const records = source.id === 'crime' ? normalizeCrime(rows) : normalizeCalls(rows);
      return {
        name: source.name, dataset: source.dataset, status: 'ok', error: null,
        lastCheckedAt: now.toISOString(), lastSuccessAt: now.toISOString(),
        sourceUpdatedAt: new Date(meta.rowsUpdatedAt * 1000).toISOString(),
        metadataURL, query, sourceRowCount: rows.length, records
      };
    } catch (error) {
      return { ...old, name: source.name, dataset: source.dataset, metadataURL, lastCheckedAt: now.toISOString(), status: 'error', error: String(error.message).slice(0, 300) };
    }
  }));
  return { ...result, ...Object.fromEntries(POLICE_SOURCES.map((source, index) => [source.id, snapshots[index]])) };
}
