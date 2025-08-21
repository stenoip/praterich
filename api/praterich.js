// crawler.js
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";

// ------------- CONFIG ------------------
const START_URLS = [
  "https://stenoip.github.io", 
  // add other URLs you own or have permission for
];
const API_ENDPOINT = "https://your-server.com/api/praterich";
const MAX_DEPTH = 2;
const USER_AGENT = "SafeCrawlerBot/1.0";
// ----------------------------------------

async function canCrawl(url) {
  const { origin } = new URL(url);
  const robotsTxtUrl = `${origin}/robots.txt`;
  try {
    const res = await fetch(robotsTxtUrl);
    if (!res.ok) return true; // no robots.txt, assume allowed
    const txt = await res.text();
    const robots = robotsParser(robotsTxtUrl, txt);
    return robots.isAllowed(url, USER_AGENT);
  } catch {
    return true; // fail-open on fetch error
  }
}

async function crawl(url, visited = new Set(), depth = 0) {
  if (visited.has(url) || depth > MAX_DEPTH) return;
  visited.add(url);

  if (!(await canCrawl(url))) {
    console.log(`❌ Disallowed by robots.txt: ${url}`);
    return;
  }

  console.log(`🌐 Fetching: ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.warn(`Failed to fetch ${url}: ${res.status}`);
    return;
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const textContent = $("body").text().replace(/\s+/g, " ").trim();

  // send text to your API handler
  try {
    await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://stenoip.github.io"
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: textContent.slice(0, 5000) }]} // keep it small
        ]
      })
    });
    console.log(`✅ Sent content from ${url}`);
  } catch (err) {
    console.error(`Error sending content from ${url}:`, err);
  }

  // follow same-domain links
  const links = $("a[href]")
    .map((_, el) => new URL($(el).attr("href"), url).toString())
    .get()
    .filter(link => link.startsWith(new URL(url).origin));

  for (const link of links) {
    await crawl(link, visited, depth + 1);
  }
}

// run the crawler
(async () => {
  for (const startUrl of START_URLS) {
    await crawl(startUrl);
  }
})();
