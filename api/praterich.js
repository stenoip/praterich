// api/praterich.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";

const MAX_CHARS_PER_PAGE = 5000;
const USER_AGENT = "SafeCrawlerBot/1.0";

// Utility: check robots.txt for permission
async function canCrawl(url) {
  try {
    const { origin } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl);
    if (!res.ok) return true;
    const txt = await res.text();
    const robots = robotsParser(robotsUrl, txt);
    return robots.isAllowed(url, USER_AGENT);
  } catch {
    return false;
  }
}

// Utility: fetch and extract plain text from <body>
async function fetchPageText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_CHARS_PER_PAGE);
}

export default async function handler(request, response) {
  // Set CORS for your domain
  response.setHeader("Access-Control-Allow-Origin", "https://stenoip.github.io");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  const origin = request.headers["origin"];
  if (origin !== "https://stenoip.github.io") {
    return response.status(403).json({ error: "Forbidden: Unauthorized origin." });
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

    const { contents = [], system_instruction, crawl = false, urls = [] } = request.body;

    let enrichedContents = [...contents];

    // Optional crawl mode
    if (crawl && Array.isArray(urls) && urls.length > 0) {
      for (const url of urls) {
        if (await canCrawl(url)) {
          try {
            const pageText = await fetchPageText(url);
            enrichedContents.unshift({
              role: "user",
              parts: [{ text: `Page text from ${url}:\n${pageText}` }]
            });
          } catch (err) {
            console.warn(`Skipping ${url}: ${err.message}`);
          }
        } else {
          console.warn(`Disallowed by robots.txt: ${url}`);
        }
      }
    }

    const payload = {
      contents: enrichedContents,
      safetySettings: [],
      generationConfig: {}
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response
      .status(500)
      .json({ error: "Failed to generate content.", details: error.message });
  }
}
