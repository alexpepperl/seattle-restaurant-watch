import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fetchWithRetry } from './http.mjs';

export const FEEDS = [
  { id: 'my-ballard', name: 'My Ballard', url: 'https://www.myballard.com/feed/' },
  { id: 'my-ballard-breakins', name: 'My Ballard · break-in archive', url: 'https://www.myballard.com/?s=break-in&feed=rss2' },
  { id: 'my-ballard-burglary', name: 'My Ballard · burglary archive', url: 'https://www.myballard.com/?s=burglar&feed=rss2' },
  { id: 'my-ballard-vandalism', name: 'My Ballard · vandalism archive', url: 'https://www.myballard.com/?s=vandal&feed=rss2' },
  { id: 'spd-blotter', name: 'SPD Blotter', url: 'https://spdblotter.seattle.gov/feed/', ballardOnly: true },
  { id: 'king5', name: 'KING 5', url: 'https://www.king5.com/feeds/syndication/rss/news/local', ballardOnly: true },
  { id: 'fox13', name: 'FOX 13 Seattle', url: 'https://www.fox13seattle.com/rss/category/news', ballardOnly: true },
  { id: 'kiro7', name: 'KIRO 7', url: 'https://www.kiro7.com/arc/outboundfeeds/rss/category/news/local/?outputType=xml', ballardOnly: true },
  { id: 'ballard-alliance', name: 'Ballard Alliance', url: 'https://ballardalliance.com/feed/' }
];
const incidentPattern = /\b(burglar\w*|break[\s\u2010-\u2015-]?ins?|broken\s+into|smash[\s-]?and[\s-]?grabs?|vandal\w*|copper\s+theft)\b/i;
const businessPattern = /\b(restaurants?|caf[eé]s?|coffee|delicatessen|delis?|baker(?:y|ies)|bistros?|bars?|taverns?|pizzerias?|tacos?|sandwich(?:es)?|biscuits?|donuts?|doughnuts?|eater(?:y|ies)|brewer(?:y|ies)|burgers?|bbq)\b/i;
const parser = new XMLParser({ ignoreAttributes: true, processEntities: false, trimValues: true });
function decode(text) {
  return String(text).replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, code) => {
    const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
  }).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity]);
}
const clean = value => decode(typeof value === 'string' ? value : '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function parseFeed(xml, feed) {
  if (xml.length > 8_000_000) throw new Error('RSS response exceeds size limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('RSS document contains unsupported entity declarations');
  const validity = XMLValidator.validate(xml);
  if (validity !== true) throw new Error(`Invalid RSS XML: ${validity.err.msg}`);
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel || typeof channel !== 'object') throw new Error('Expected an RSS channel');
  const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  const leads = [];
  const warnings = [];
  for (const item of items) {
    const title = clean(item.title);
    const context = `${title} ${clean(item.description)} ${clean(item['content:encoded'])}`;
    if (!incidentPattern.test(context) || !businessPattern.test(context)) continue;
    if (feed.ballardOnly && !/\b(ballard|leary|sunset hill|loyal heights)\b/i.test(context)) continue;
    let url;
    try {
      url = new URL(item.link);
      if (url.protocol !== 'https:' || url.hostname !== new URL(feed.url).hostname) throw new Error('Unexpected article host');
    } catch { warnings.push(`Skipped headline with an invalid source URL: ${title.slice(0, 100)}`); continue; }
    const published = new Date(item.pubDate);
    if (!title || !Number.isFinite(published.getTime())) { warnings.push('Skipped matching RSS item with missing title or invalid publication date'); continue; }
    url.hash = '';
    url.search = '';
    leads.push({ title: title.slice(0, 260), url: url.href, publisher: feed.name, publishedAt: published.toISOString() });
  }
  return { leads, warnings };
}

export async function collectFeeds(previous, { fetcher = fetch, now = new Date(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const timestamp = now.toISOString();
  const leads = new Map((previous.leads || []).map(lead => [lead.url, lead]));
  const feeds = await Promise.all(FEEDS.map(async feed => {
    const old = previous.feeds?.find(item => item.id === feed.id);
    try {
      const { response, attempts } = await fetchWithRetry(feed.url, { fetcher, wait, accept: 'application/rss+xml, application/xml, text/xml' });
      const { leads: candidates, warnings } = parseFeed(await response.text(), feed);
      if (attempts > 1) warnings.push(`Source recovered after ${attempts - 1} retries.`);
      for (const lead of candidates) leads.set(lead.url, { ...lead, firstSeenAt: leads.get(lead.url)?.firstSeenAt || timestamp });
      return { ...feed, status: 'ok', lastSuccessAt: timestamp, error: null, warnings };
    } catch (error) {
      return { ...feed, status: 'error', lastSuccessAt: old?.lastSuccessAt || null, error: String(error.message).slice(0, 240), warnings: [] };
    }
  }));
  return {
    lastCheckedAt: timestamp,
    feeds,
    leads: [...leads.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 300)
  };
}
