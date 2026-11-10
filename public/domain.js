export const TYPES = { burglary: 'Break-in', attempt: 'Attempted entry', theft: 'Theft / damage', vandalism: 'Vandalism' };

export function rangeForPeriod(period, now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  if (period === 'all') return { start: '', end: '' };
  if (period === '2026') return { start: '2026-01-01', end: '2026-12-31' };
  const start = new Date(`${end}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Number(period) + 1);
  return { start: start.toISOString().slice(0, 10), end };
}

export function filterIncidents(data, filters) {
  const locations = new Map(data.locations.map(location => [location.id, location]));
  return data.incidents.filter(incident => {
    const location = locations.get(incident.locationId);
    return (!filters.start || incident.end >= filters.start)
      && (!filters.end || incident.start <= filters.end)
      && (!filters.neighborhood || location.neighborhood === filters.neighborhood)
      && (!filters.type || incident.type === filters.type)
      && (!filters.query || `${location.name} ${location.address} ${location.neighborhood}`.toLowerCase().includes(filters.query.toLowerCase().trim()));
  }).sort((a, b) => b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
}

export function summarize(incidents) {
  const counts = new Map();
  for (const incident of incidents) counts.set(incident.locationId, (counts.get(incident.locationId) || 0) + 1);
  return {
    incidents: incidents.length,
    locations: counts.size,
    repeats: [...counts.values()].filter(count => count > 1).length,
    cost: incidents.reduce((sum, incident) => sum + (incident.cost?.min || 0), 0),
    costCount: incidents.filter(incident => incident.cost?.min > 0).length,
    moreThan: incidents.some(incident => incident.cost?.qualifier === 'more-than'),
    counts
  };
}

export function monthlyCounts(incidents, start, end) {
  if (!incidents.length) return { months: [], uncertain: 0 };
  const first = start || incidents.reduce((value, incident) => incident.start < value ? incident.start : value, incidents[0].start);
  const last = end || incidents.reduce((value, incident) => incident.end > value ? incident.end : value, incidents[0].end);
  const months = [];
  const date = new Date(`${first.slice(0, 7)}-01T12:00:00Z`);
  const stop = last.slice(0, 7);
  for (let i = 0; i < 1200 && date.toISOString().slice(0, 7) <= stop; i++, date.setUTCMonth(date.getUTCMonth() + 1)) {
    const key = date.toISOString().slice(0, 7);
    months.push({ key, count: incidents.filter(incident => incident.start.slice(0, 7) === key && incident.end.slice(0, 7) === key).length });
  }
  return { months, uncertain: incidents.filter(incident => incident.start.slice(0, 7) !== incident.end.slice(0, 7)).length };
}

export const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const safeURL = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; } };
