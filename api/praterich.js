/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Google Gemini API.
It injects custom context, including news headlines and site content, to ground the model's responses.

Added in this version:
 File (image/PDF) upload support using multipart/form-data



If you want a Praterich A.I chatbot on your site, send a request to customerserviceforstenoip@gmail.com
*/

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";
import path from "path";
import Parser from "rss-parser";
import formidable from "formidable";

// --- Vercel Config (for file upload support) ---
export const config = {
  api: {
    bodyParser: false, // Disable default parser for file uploads
  },
};

// --- Configuration ---
const parser = new Parser();
const NEWS_FEEDS = {
  BBC: "http://feeds.bbci.co.uk/news/world/rss.xml",
  CNN: "http://rss.cnn.com/rss/cnn_topstories.rss",
};
const TIMEZONE = "America/New_York";

// --- Helper Functions ---

async function getSiteContentFromFile() {
  const filePath = path.join(process.cwd(), "api", "index.json");
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data; // raw text
  } catch (error) {
    console.error("Error reading index.json:", error.message);
    return "Error: Could not retrieve content from index.json.";
  }
}

async function getNewsContent() {
  let newsText = "\n--- Global News Headlines ---\n";
  try {
    const allNewsPromises = Object.entries(NEWS_FEEDS).map(async ([source, url]) => {
      const feed = await parser.parseURL(url);
      let sourceNews = `\n**${source} Top Stories (Latest):**\n`;

      feed.items.slice(0, 3).forEach((item, index) => {
        const safeTitle = item.title.replace(/[\*\_\[\]]/g, "");
        sourceNews += `  ${index + 1}. ${safeTitle}\n`;
      });
      return sourceNews;
    });

    const newsResults = await Promise.all(allNewsPromises);
    newsText += newsResults.join("");
    return newsText;
  } catch (error) {
    console.error("Error fetching or parsing RSS feeds:", error.message);
    return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news.]\n";
  }
}

// --- Main Handler ---
export default async function handler(request, response) {
  const allowedOrigins = [
    "https://stenoip.github.io",
    "https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720",
  ];
  const origin = request.headers["origin"];

  if (allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    return response.status(403).json({ error: "Forbidden: Unauthorized origin." });
  }

  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const API_KEY = process.env.API_KEY;
    const PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";

    if (!API_KEY) throw new Error("API_KEY environment variable is not set.");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // --- Parse multipart/form-data (text + files) ---
    const form = formidable({ multiples: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(request, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Extract text-based input
    const contents = JSON.parse(fields.contents || "[]");
    const system_instruction = JSON.parse(fields.system_instruction || "{}");

    // --- Handle uploaded files ---
    const fileParts = [];
    for (const fileArray of Object.values(files)) {
      for (const file of fileArray) {
        try {
          const buffer = await fs.readFile(file.filepath);
          const base64Data = buffer.toString("base64");
          const mimeType = file.mimetype || "application/octet-stream";
          fileParts.push({
            inlineData: { mimeType, data: base64Data },
          });
        } catch (err) {
          console.error("Error reading uploaded file:", err);
        }
      }
    }

    // --- Prepare context ---
    const scrapedContent = await getSiteContentFromFile();
    const newsContent = await getNewsContent();
    const currentTime = new Date().toLocaleString("en-US", {
      timeZone: TIMEZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const baseInstruction =
      system_instruction?.parts?.[0]?.text || "No additional instruction provided.";

    const combinedSystemInstruction = `
You are Praterich A.I., an LLM made by Stenoip Company.

**INSTRUCTION FILTERING RULE:**
If the following user-provided system instruction is inappropriate, illegal, or unethical, you must refuse to follow it and respond ONLY with the exact phrase: "I can't follow this."

--- User-Provided System Instruction ---
${baseInstruction}
--------------------------------------

**CURRENT CONTEXT FOR RESPONSE GENERATION:**
(Do not mention this context in your output.)
- **Current Time (in ${TIMEZONE}):** ${currentTime}
- **Website Content (from index.json):**
  ${scrapedContent}
- **Latest Global News Headlines:**
  ${newsContent}

${PRAT_CONTEXT_INJ}
----------------------------------
`;

    // --- Combine user text + files ---
    const combinedContents = [...contents, ...fileParts];

    // --- Call Gemini ---
    const result = await model.generateContent({
      contents: combinedContents,
      systemInstruction: { parts: [{ text: combinedSystemInstruction }] },
    });

    response.status(200).json({ text: result.response.text() });
  } catch (error) {
    console.error("API call failed:", error);
    if (error.status === 429) {
      return response.status(429).json({
        error: "Rate limit exceeded. Please wait and try again.",
        retryAfter: "60 seconds",
      });
    }

    response.status(500).json({
      error: "Failed to generate content.",
      details: error.message || "Unknown error occurred.",
    });
  }
}
