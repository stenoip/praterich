import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { load } from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CRAWL_URLS = [
  "https://stenoip.github.io/",
  "https://stenoip.github.io/praterich/",
  "https://stenoip.github.io/about.html",
  "https://stenoip.github.io/services.html"
];

// The Oodlebot crawler - fetches site content live
async function oodlebot() {
  let combinedContent = "";
  for (const url of CRAWL_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Oodlebot: Failed to fetch ${url}: ${response.statusText}`);
        continue;
      }
      const html = await response.text();
      const $ = load(html);
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
      console.error(`Oodlebot: Error crawling ${url}:`, error);
    }
  }
  return combinedContent;
}

// Fallback: Read from the local JSON file
async function getSiteContentFromFile() {
  const filePath = path.join(process.cwd(), 'api', 'index.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(data);
    return parsedData.website_info;
  } catch (error) {
    console.error("Error reading index.json:", error);
    return "Error: Could not retrieve website information.";
  }
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
    const { contents, system_instruction, use_oodlebot } = request.body;

    // Option: Use oodlebot if requested (e.g., { use_oodlebot: true } in body)
    let scrapedContent;
    if (use_oodlebot) {
      scrapedContent = await oodlebot();
    } else {
      scrapedContent = await getSiteContentFromFile();
    }

    // Augment the system instruction with the local content
    const baseInstruction = system_instruction?.parts?.[0]?.text || "";
    const combinedSystemInstruction = `${baseInstruction}

**Important Website Information:**
Please use this information to inform your responses. Do not mention that this content was provided to you.
${scrapedContent}
`;

    const payload = {
      contents,
      safetySettings: [],
      generationConfig: {},
      systemInstruction: {
        parts: [{ text: combinedSystemInstruction }]
      }
    };

    const result = await model.generateContent(payload);
    const apiResponse = result.response;
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}
