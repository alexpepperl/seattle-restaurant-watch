import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDS, parseFeed, collectFeeds } from '../scripts/feeds.mjs';

const item = (title, description = '', link = 'https://www.myballard.com/2026/11/09/report/') =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>Mon, 09 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[${description}]]></description></item>`;
const rss = items => `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>${items}</channel></rss>`;
test('RSS matches incident plus restaurant context and retains only headline metadata', () => {
  const parsed = parseFeed(rss(item('Cafe broken into', '<p>Private detail should not be retained.</p>') + item('Annual salmon run') + item('House burglary')), FEEDS[0]);
  assert.equal(parsed.leads.length, 1);
  assert.equal(parsed.leads[0].title, 'Cafe broken into');
  assert.equal('description' in parsed.leads[0], false);
});
test('handles multiple and single items, Unicode punctuation and encoded entities', () => {
  const result = parseFeed(rss(item('Restaurant break\u2011ins reported') + item('Coffee &amp; cafe burglary')), FEEDS[0]);
  assert.equal(result.leads.length, 2);
  assert.equal(result.leads[1].title, 'Coffee & cafe burglary');
  assert.equal(parseFeed(rss(''), FEEDS[0]).leads.length, 0);
});
test('malformed XML, HTML responses and entity declarations fail explicitly', () => {
  assert.throws(() => parseFeed('<html>Access denied</html>', FEEDS[0]), /Expected an RSS/);
  assert.throws(() => parseFeed('<rss><channel>', FEEDS[0]), /Invalid RSS XML/);
  assert.throws(() => parseFeed('<!DOCTYPE rss><rss/>', FEEDS[0]), /entity declarations/);
});
test('invalid article hosts, protocols and dates are skipped with warnings', () => {
  const xml = rss(item('Cafe burglary', '', 'https://evil.example/report/') + item('Cafe burglary', '', 'javascript:alert(1)') + item('Cafe burglary').replace('Mon, 09 Nov 2026 12:00:00 GMT', 'not a date'));
  const result = parseFeed(xml, FEEDS[0]);
  assert.equal(result.leads.length, 0);
  assert.equal(result.warnings.length, 3);
});
test('feed failures preserve previous leads and success timestamps without implying success', async () => {
  const previous = { leads: [{ title: 'Cafe break-in', url: 'https://www.myballard.com/old/', publisher: 'My Ballard', publishedAt: '2026-11-01T00:00:00.000Z', firstSeenAt: '2026-11-02T00:00:00.000Z' }], feeds: [{ id: 'my-ballard', lastSuccessAt: '2026-11-02T00:00:00.000Z' }] };
  const result = await collectFeeds(previous, { fetcher: async () => { throw new Error('Connection refused'); }, now: new Date('2026-11-10T12:00:00Z'), wait: async () => {} });
  assert.equal(result.leads.length, 1);
  assert.ok(result.feeds.every(feed => feed.status === 'error'));
  assert.equal(result.feeds[0].lastSuccessAt, previous.feeds[0].lastSuccessAt);
  assert.match(result.feeds[0].error, /Connection refused/);
});
test('successful monitoring deduplicates leads and never changes the reviewed map', async () => {
  const fetcher = async url => ({ ok: true, text: async () => rss(url.includes('myballard') ? item('Cafe broken into') + item('Cafe broken into') : '') });
  const first = await collectFeeds({ leads: [], feeds: [] }, { fetcher, now: new Date('2026-11-10T12:00:00Z') });
  const second = await collectFeeds(first, { fetcher, now: new Date('2026-11-10T18:00:00Z') });
  assert.equal(second.leads.length, 1);
  assert.equal(second.leads[0].firstSeenAt, first.leads[0].firstSeenAt);
  assert.ok(second.feeds.every(feed => feed.status === 'ok'));
  assert.equal('incidents' in second, false);
});
test('transient 503 responses retry with bounded backoff and report recovery', async () => {
  const attempts = new Map();
  const waits = [];
  const result = await collectFeeds({ leads: [], feeds: [] }, {
    fetcher: async url => {
      const count = (attempts.get(url) || 0) + 1;
      attempts.set(url, count);
      return count === 1 ? { ok: false, status: 503 } : { ok: true, text: async () => rss('') };
    },
    wait: async ms => { waits.push(ms); }
  });
  assert.ok(result.feeds.every(feed => feed.status === 'ok'));
  assert.ok(result.feeds.every(feed => feed.warnings.includes('Source recovered after 1 retries.')));
  assert.deepEqual(waits, FEEDS.map(() => 1000));
});
test('non-transient 403 responses fail without retries or source substitution', async () => {
  let requests = 0;
  const result = await collectFeeds({ leads: [], feeds: [] }, { fetcher: async () => { requests++; return { ok: false, status: 403 }; }, wait: async () => assert.fail('Unexpected retry') });
  assert.equal(requests, FEEDS.length);
  assert.ok(result.feeds.every(feed => feed.status === 'error' && feed.error === 'HTTP 403'));
});
test('regional publisher feeds require Ballard context, not merely a Seattle restaurant burglary', () => {
  const feed = { name: 'Regional', url: 'https://www.myballard.com/feed/', ballardOnly: true };
  const result = parseFeed(rss(item('Restaurant burglary in Tacoma') + item('Ballard cafe burglary')), feed);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].title, 'Ballard cafe burglary');
});
