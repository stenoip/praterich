import fetch from 'node-fetch';
import cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CRAWL_URLS = [
  "https://stenoip.github.io/",
  "https://stenoip.github.io/praterich/",
  "https://stenoip.github.io/about.html",
  "https://stenoip.github.io/services.html"
];

async function getSiteContent() {
  let combinedContent = "";
  for (const url of CRAWL_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.statusText}`);
        continue;
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      const allText = $('body').text().replace(/\s+/g, ' ').trim();

      let imageDescriptions = [];
      $('img').each((i, el) => {
        const altText = $(el).attr('alt');
        if (altText) {
          imageDescriptions.push(`Image description: ${altText}`);
        }
      });
      combinedContent += `--- Content from ${url} ---\n${allText}\n${imageDescriptions.join('\n')}\n`;
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }
  return combinedContent;
}

async function main() {
  console.log("Starting to crawl websites...");
  const crawledData = await getSiteContent();

  const outputData = { website_info: crawledData };

  const filePath = path.join(process.cwd(), 'api', 'index.json');
  try {
    await fs.writeFile(filePath, JSON.stringify(outputData, null, 2), 'utf8');
    console.log("Successfully generated index.json with crawled data!");
  } catch (error) {
    console.error("Error writing to file:", error);
  }
}

main();
