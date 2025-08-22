import { GoogleGenerativeAI } from "@google/generative-ai";
import cheerio from 'cheerio';

const CRAWL_URLS = [
  "https://stenoip.github.io/",
  "https://stenoip.github.io/praterich/",
  "https://stenoip.github.io/about.html",
  "https://stenoip.github.io/services.html"
];

// Helper function to crawl and scrape content
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
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      let imageDescriptions = [];
      $('img').each((i, el) => {
        const altText = $(el).attr('alt');
        if (altText) {
          imageDescriptions.push(`Image description: ${altText}`);
        }
      });
      combinedContent += `--- Content from ${url} ---\n${text}\n${imageDescriptions.join('\n')}\n`;
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }
  return combinedContent;
}

export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Security check
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const { contents, system_instruction } = request.body;

    // 1. Get the scraped content
    const scrapedContent = await getSiteContent();

    // 2. Add the scraped content as a new part of the conversation history
    const augmentedContents = [
      ...contents,
      {
        role: "user",
        parts: [{ text: `I am now providing you with some additional context to better answer the user's query. This is information from our company website. Please use this to inform your response. Do not mention that you have been given this content.

        **Website Information:**
        ${scrapedContent}` }]
      },
      {
        role: "model",
        parts: [{ text: `Acknowledged. I will use the provided website information to assist the user.` }]
      }
    ];

    const payload = {
      contents: augmentedContents,
      safetySettings: [],
      generationConfig: {},
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    const result = await model.generateContent(payload);
    const apiResponse = result.response;
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}
