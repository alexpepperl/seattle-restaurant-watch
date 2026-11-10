import { TYPES, rangeForPeriod, filterIncidents, summarize, monthlyCounts, money, escapeHTML as esc, safeURL } from './domain.js';

const $ = id => document.getElementById(id);
let data;
let visible = [];
let map;
let layer;
let mode = 'pins';
let selectedId;
let updating = false;
let lastFilters = {};
const external = 'target="_blank" rel="noopener noreferrer"';
const typeTag = type => `<span class="type-tag type-${esc(type)}">${esc(TYPES[type])}</span>`;
const locationFor = id => data.locations.find(location => location.id === id);
const fullDate = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function getJSON(path) {
  const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function initMap() {
  if (!window.L) {
    showMapError('The map library could not load. All incident reports and filters remain available in the list.');
    $('fit-map').disabled = true;
    return;
  }
  map = L.map('map', { scrollWheelZoom: false, zoomControl: true }).setView([47.626, -122.382], 11);
  let failedTiles = 0;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }).on('tileerror', () => {
    if (++failedTiles >= 3) showMapError('Some background map tiles could not load. Location pins and the sourced report list are still available.');
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

function showMapError(message) {
  $('map-error').textContent = message;
  $('map-error').hidden = false;
}

function readFilters() {
  const custom = $('period').value === 'custom';
  $('custom-dates').hidden = !custom;
  const range = custom
    ? { start: $('start-date').value, end: $('end-date').value }
    : rangeForPeriod($('period').value);
  const invalid = custom && ((!range.start || !range.end) || range.start > range.end || !$('start-date').validity.valid || !$('end-date').validity.valid);
  $('date-error').textContent = invalid ? 'Choose a valid start and end date. Previous results remain visible; export is disabled.' : '';
  $('download').disabled = Boolean(invalid);
  if (invalid) return null;
  return { ...range, neighborhood: $('neighborhood').value, type: $('type').value, query: $('search').value };
}

function render(fit = true) {
  if (!data) return;
  const filters = readFilters();
  if (!filters) return;
  lastFilters = filters;
  visible = filterIncidents(data, filters);
  const stats = summarize(visible);
  $('stat-incidents').textContent = stats.incidents;
  $('stat-locations').textContent = stats.locations;
  $('stat-repeats').textContent = stats.repeats;
  $('stat-cost').textContent = stats.costCount ? `${stats.moreThan ? '>' : ''}${money(stats.cost)}` : 'Unknown';
  $('cost-caption').textContent = stats.costCount ? `Lower estimates from ${stats.costCount} reports · not audited` : 'No lower cost estimates in this view';
  $('map-count').textContent = `${stats.locations} locations in view`;
  $('report-count').textContent = `${visible.length} reports`;
  $('review-date').textContent = `Incidents reviewed ${fullDate(data.reviewedAt)}`;
  renderList();
  renderMap(stats, fit);
  renderTrends(stats);
  renderSupport(stats);
}

function renderList() {
  $('incident-list').innerHTML = visible.length ? visible.map(incident => {
    const location = locationFor(incident.locationId);
    return `<button type="button" class="incident-card${selectedId === incident.id ? ' selected' : ''}" data-incident="${esc(incident.id)}" aria-label="${esc(location.name)}, ${esc(incident.dateLabel)}, ${esc(TYPES[incident.type])}. View sourced details.">
      <span class="date-row"><span>${esc(incident.dateLabel)}</span>${typeTag(incident.type)}</span>
      <h4>${esc(location.name)} <span aria-hidden="true">↗</span></h4>
      <p>${esc(incident.summary)}</p>
      <span class="card-meta"><span>${esc(location.neighborhood)}</span><span>·</span><span>${esc(data.sources[incident.sourceId].publisher)}</span>${incident.cost ? `<span class="card-cost">${esc(incident.cost.label)}</span>` : ''}</span>
    </button>`;
  }).join('') : '<p class="empty-state">No matching reports in this collection.<br>Try a wider date range or reset the filters. An empty view does not mean no incidents occurred.</p>';
}

function renderMap(stats, fit) {
  if (!map) return;
  layer.clearLayers();
  const points = [];
  for (const [locationId, count] of stats.counts) {
    const location = locationFor(locationId);
    const point = [location.lat, location.lng];
    points.push(point);
    const popup = `<h3>${esc(location.name)}</h3><p>${esc(location.address)} · ${esc(location.neighborhood)}</p><b>${count} mapped ${count === 1 ? 'incident' : 'incidents'} in this view</b><button type="button" class="popup-detail" data-location="${esc(locationId)}">Read reports & support this place ↗</button>`;
    if (mode === 'density') {
      L.circle(point, { radius: 150 + count * 100, color: count > 1 ? '#193e36' : '#d95c37', weight: 1, fillOpacity: .18 }).bindPopup(popup).addTo(layer);
    }
    L.marker(point, {
      title: `${location.name}: ${count} mapped ${count === 1 ? 'incident' : 'incidents'}`,
      alt: `${location.name}, ${location.neighborhood}`,
      icon: L.divIcon({ className: 'restaurant-marker', html: `<div class="map-pin${count > 1 ? ' is-repeat' : ''}"><span>${count > 1 ? count : '·'}</span></div>`, iconSize: [24, 30], iconAnchor: [12, 27], popupAnchor: [0, -25] })
    }).bindPopup(popup).addTo(layer);
  }
  if (fit && points.length) map.fitBounds(L.latLngBounds(points).pad(.16), { maxZoom: 15, animate: false });
  if (fit && !points.length) map.setView([47.626, -122.382], 11);
}

function renderTrends(stats) {
  const { months, uncertain } = monthlyCounts(visible, lastFilters.start, lastFilters.end);
  const maximum = Math.max(1, ...months.map(month => month.count));
  $('chart').innerHTML = months.length ? months.map(month => {
    const date = new Date(`${month.key}-01T12:00:00Z`);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return `<div class="bar-column"><button type="button" data-month="${month.key}" style="height:${Math.max(3, month.count / maximum * 122)}px" title="${label}: ${month.count} incidents. Filter to this month." aria-label="${label}: ${month.count} incidents. Filter to this month."><span class="bar-value">${month.count || ''}</span></button><span>${label.replace(' ', '<br>')}</span></div>`;
  }).join('') : '<p class="empty-state">No matching reports to chart.</p>';
  $('chart-note').textContent = `${uncertain} cross-month uncertain ${uncertain === 1 ? 'date is' : 'dates are'} excluded from bars, but included in totals and the map. Click a bar to explore that month.`;
  const repeats = [...stats.counts].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  $('repeat-list').innerHTML = repeats.length ? repeats.map(([id, count]) => {
    const location = locationFor(id);
    return `<div class="repeat-row"><span class="repeat-number">${count}</span><div><h4>${esc(location.name)}</h4><p>${esc(location.neighborhood)} · separately mapped incidents</p></div><button type="button" data-location="${esc(id)}" aria-label="View repeat incidents at ${esc(location.name)}">↗</button></div>`;
  }).join('') : '<p class="empty-state">No location has two separately mapped incidents in this view. Earlier incidents may be mentioned in individual reports.</p>';
}

function renderSupport(stats) {
  $('support-list').innerHTML = stats.locations ? [...stats.counts.keys()].map(id => {
    const location = locationFor(id);
    const closed = location.status === 'closure-reported';
    const url = closed ? data.sources[location.statusSourceId].url : location.website;
    return `<article class="support-card"><div class="support-card-top"><span class="support-icon" aria-hidden="true">${closed ? '—' : '⌂'}</span><span class="support-location">${esc(location.neighborhood)}</span></div><h3>${esc(location.name)}</h3><p>${esc(location.category)}</p><a href="${esc(safeURL(url))}" ${external}>${closed ? 'Read closure report' : 'Plan a visit'} <span aria-hidden="true">↗</span><span class="sr-only"> · ${esc(location.name)} (external link)</span></a></article>`;
  }).join('') : '<p class="empty-state">Widen your filters to find places to support.</p>';
}

function showLocation(id, incidentId) {
  const location = locationFor(id);
  if (!location) return;
  selectedId = incidentId;
  const incidents = visible.filter(incident => incident.locationId === id);
  const closed = location.status === 'closure-reported';
  const visitLink = closed ? data.sources[location.statusSourceId].url : location.website;
  $('dialog-content').innerHTML = `<div class="dialog-eyebrow">${esc(location.neighborhood.toUpperCase())} · SOURCED REPORTS</div>
    <h2 id="dialog-title">${esc(location.name)}</h2><p class="dialog-address">${esc(location.address)}, Seattle · approximate map pin</p>
    ${closed ? '<p class="dialog-footnote">Closure reported in May 2026. This is a historical incident location, not an active dining recommendation.</p>' : ''}
    <div class="dialog-actions"><a class="button button-orange" href="${esc(safeURL(visitLink))}" ${external}>${closed ? 'Read closure report' : 'Plan a visit'} ↗</a><a class="button button-outline" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.name} ${location.address} Seattle`)}" ${external}>${closed ? 'View former location' : 'Get directions'} ↗</a></div>
    ${incidents.map(incident => {
      const source = data.sources[incident.sourceId];
      return `<article class="detail-incident"><h3>${esc(incident.dateLabel)} ${typeTag(incident.type)}</h3><p>${esc(incident.summary)}</p><p>${esc(incident.details)}</p>
        ${incident.cost ? `<div class="detail-cost"><strong>${esc(incident.cost.label)}</strong><small>${esc(incident.cost.kind)} · owner / media estimate, not audited</small></div>` : '<p class="fine-print">Cost not reported. This does not mean no financial loss.</p>'}
        <a class="detail-source" href="${esc(safeURL(source.url))}" ${external}>${esc(source.publisher)} · published ${fullDate(source.published)} ↗</a></article>`;
    }).join('')}<p class="dialog-footnote">Showing ${incidents.length} mapped reports in your current filters. Check current hours and operating status with the business. Sourced reporting is not independent police confirmation.</p>`;
  if (map) map.setView([location.lat, location.lng], Math.max(14, map.getZoom()), { animate: false });
  renderList();
  $('incident-dialog').showModal();
}

function renderSources() {
  $('source-links').innerHTML = Object.values(data.sources).map(source =>
    `<a class="source-link" href="${esc(safeURL(source.url))}" ${external}>${esc(source.title)} ↗<span>${esc(source.publisher)} · ${fullDate(source.published)}</span></a>`
  ).join('');
}

function renderMonitor(monitor) {
  if (!Array.isArray(monitor.feeds) || !Array.isArray(monitor.leads)) throw new Error('Invalid source-monitor format');
  const checked = monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt) : null;
  const stale = !checked || !Number.isFinite(checked.getTime()) || Date.now() - checked.getTime() > 18 * 3600000;
  const failed = monitor.feeds.filter(feed => feed.status !== 'ok');
  $('monitor-status').textContent = checked
    ? `${stale ? 'Updates overdue. ' : ''}Last automated check: ${checked.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. ${failed.length ? `${failed.length} feed(s) unavailable; results may be incomplete.` : 'Feeds checked successfully.'}`
    : 'Automated source monitoring has not run yet. Mapped incidents are the manually reviewed starting collection.';
  $('monitor-status').classList.toggle('feed-error', stale || failed.length > 0);
  const mappedSources = new Set(Object.values(data.sources).map(source => source.url.replace(/\/$/, '')));
  const leads = monitor.leads.filter(lead => !mappedSources.has(lead.url.replace(/\/$/, '')));
  $('leads').innerHTML = leads.length ? leads.slice(0, 8).map(lead => `<article class="lead"><a href="${esc(safeURL(lead.url))}" ${external}>${esc(lead.title)} ↗</a><small>${esc(lead.publisher)} · ${esc(new Date(lead.publishedAt).toLocaleDateString())} · Unreviewed lead</small></article>`).join('') + (leads.length > 8 ? `<a class="text-link" href="data/monitor.json">See all ${leads.length} unreviewed leads (JSON) ↗</a>` : '')
    : '<p class="fine-print">No additional matching headlines in the retained feed results. This does not mean there have been no new incidents.</p>';
  $('feed-health').innerHTML = monitor.feeds.map(feed => `<div class="feed-row${feed.status === 'ok' ? '' : ' feed-error'}"><strong>${esc(feed.name)} · ${esc(feed.status)}</strong>${feed.error ? esc(feed.error) : 'Public RSS feed'}${feed.lastSuccessAt ? `<br>Last successful check: ${esc(new Date(feed.lastSuccessAt).toLocaleString())}` : ''}${(feed.warnings || []).map(warning => `<p class="feed-error">${esc(warning)}</p>`).join('')}</div>`).join('');
}

async function update(initial = false) {
  if (updating) return;
  updating = true;
  $('refresh').disabled = true;
  $('refresh').textContent = 'Checking published updates…';
  const results = await Promise.allSettled([getJSON('data/incidents.json'), getJSON('data/monitor.json')]);
  try {
    if (results[0].status === 'fulfilled') {
      const next = results[0].value;
      if (!Array.isArray(next.incidents) || !Array.isArray(next.locations) || !next.sources) throw new Error('Invalid incident dataset');
      data = next;
      const old = $('neighborhood').value;
      $('neighborhood').innerHTML = '<option value="">All neighborhoods</option>' + [...new Set(data.locations.map(location => location.neighborhood))].sort().map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
      $('neighborhood').value = [...$('neighborhood').options].some(option => option.value === old) ? old : '';
      $('load-error').hidden = true;
      render(initial);
      renderSources();
    } else {
      throw new Error(`Incident data could not be refreshed. ${data ? 'Previous results remain visible.' : 'The map and totals are unavailable; try again.'} ${results[0].reason.message}`);
    }
  } catch (error) {
    console.error(error);
    $('load-error').textContent = error.message;
    $('load-error').hidden = false;
    if (!data) $('incident-list').innerHTML = '<p class="empty-state">Incident data is unavailable. Use “Check for updates” to retry.</p>';
  }
  try {
    if (results[1].status === 'rejected') throw results[1].reason;
    renderMonitor(results[1].value);
  } catch (error) {
    console.error('Source monitoring unavailable:', error);
    $('monitor-status').textContent = `Source-monitor status is unavailable. ${error.message} Automatic checks cannot be confirmed.`;
    $('monitor-status').classList.add('feed-error');
  }
  updating = false;
  $('refresh').disabled = false;
  $('refresh').textContent = 'Check for updates ↻';
}

function downloadCSV() {
  const columns = ['Restaurant', 'Neighborhood', 'Address', 'Type', 'Date label', 'Earliest date', 'Latest date', 'Date precision', 'Reported cost', 'Summary', 'Source', 'Source published'];
  const rows = visible.map(incident => {
    const location = locationFor(incident.locationId);
    const source = data.sources[incident.sourceId];
    return [location.name, location.neighborhood, location.address, TYPES[incident.type], incident.dateLabel, incident.start, incident.end, incident.precision, incident.cost?.label || 'Not reported', incident.summary, source.url, source.published];
  });
  const quote = value => `"${String(value).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const blob = new Blob(['\uFEFF', [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'seattle-restaurant-watch.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('filters').addEventListener('submit', event => event.preventDefault());
$('filters').addEventListener('input', () => render());
$('filters').addEventListener('reset', () => setTimeout(() => render(), 0));
$('refresh').addEventListener('click', () => update());
$('download').addEventListener('click', downloadCSV);
$('fit-map').addEventListener('click', () => renderMap(summarize(visible), true));
$('pins-mode').addEventListener('click', () => setMode('pins'));
$('density-mode').addEventListener('click', () => setMode('density'));
function setMode(value) {
  mode = value;
  for (const [id, active] of [['pins-mode', value === 'pins'], ['density-mode', value === 'density']]) {
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', String(active));
  }
  renderMap(summarize(visible), false);
}
document.addEventListener('click', event => {
  const incidentButton = event.target.closest('[data-incident]');
  const locationButton = event.target.closest('[data-location]');
  const monthButton = event.target.closest('[data-month]');
  if (incidentButton) {
    const incident = data.incidents.find(item => item.id === incidentButton.dataset.incident);
    if (incident) showLocation(incident.locationId, incident.id);
  } else if (locationButton) showLocation(locationButton.dataset.location);
  else if (monthButton) {
    const key = monthButton.dataset.month;
    const date = new Date(`${key}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    $('period').value = 'custom';
    $('start-date').value = `${key}-01`;
    $('end-date').value = date.toISOString().slice(0, 10);
    render();
    $('explore').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
});
$('close-dialog').addEventListener('click', () => $('incident-dialog').close());
$('incident-dialog').addEventListener('click', event => {
  if (event.target !== $('incident-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
});
initMap();
update(true);
setInterval(() => { if (!document.hidden) update(); }, 5 * 60 * 1000);
