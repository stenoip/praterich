import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch'; // Install: npm install node-fetch
import cheerio from 'cheerio'; // Install: npm install cheerio

export default async function handler(request, response) {
  // Set CORS headers to allow requests from your GitHub Pages domain
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Check the Origin header to ensure the request is from your GitHub Pages site.
  // This is a crucial security measure.
  const origin = request.headers['origin'];
  if (origin !== 'https://stenoip.github.io') {
    return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); 
    const { contents, system_instruction, action, crawl_urls } = request.body;

    let payload;

    // Check for a specific action to perform a crawl
    if (action === "crawl_site" && Array.isArray(crawl_urls) && crawl_urls.length > 0) {
      let combinedContext = "";
      for (const url of crawl_urls) {
        try {
          const fetchResponse = await fetch(url);
          if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch URL: ${url} with status ${fetchResponse.status}`);
          }
          const html = await fetchResponse.text();
          const $ = cheerio.load(html);
          const scrapedText = $('body').text().replace(/\s+/g, ' ').trim();
          let imageDescriptions = [];
          $('img').each((i, el) => {
            const altText = $(el).attr('alt');
            if (altText) {
              imageDescriptions.push(`Image description: ${altText}`);
            }
          });
          
          combinedContext += `--- Content from ${url} ---\n${scrapedText}\n${imageDescriptions.join('\n')}\n`;
        } catch (err) {
          console.error(`Crawl failed for ${url}:`, err);
          combinedContext += `--- Failed to crawl ${url}: ${err.message} ---\n`;
        }
      }

      payload = {
        contents: [{ role: "user", parts: [{ text: `Based on the following content, please provide a comprehensive summary and analysis of the website. Do not mention that you are an AI or that you are crawling. Just act as an intelligent agent.
${combinedContext}` }] }],
        safetySettings: [],
        generationConfig: {},
      };
    } else {
      // Standard chat request
      payload = {
        contents,
        safetySettings: [],
        generationConfig: {},
      };
      if (system_instruction) {
        payload.systemInstruction = system_instruction;
      }
    }

    const result = await model.generateContent(payload);
    const apiResponse = result.response;
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}
