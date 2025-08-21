import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// Helper function to fetch local text files
const fetchLocalFile = (fileName) => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(process.cwd(), 'data', fileName);
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

// Helper function to scrape content from a website (WikiHow in this case)
const scrapeWebsite = async (url) => {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const articleContent = $('.article-content').text().trim();
    return articleContent;
  } catch (error) {
    console.error("Failed to scrape website:", error);
    return '';
  }
};

// Main handler function
export default async function handler(request, response) {
  // Set CORS headers to allow requests from your GitHub Pages domain
  const allowedOrigin = 'https://stenoip.github.io';
  const origin = request.headers['origin'];

  // Allow the specific origin and preflight requests
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Credentials', 'true');

  // If the request is a preflight OPTIONS request, respond with status 200
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Check the origin against the allowed one
  if (origin !== allowedOrigin) {
    return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  // Only allow POST requests
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

    // Fetch the local files (more_info.txt, personality.txt)
    const moreInfoContent = await fetchLocalFile('more_info.txt');
    const personalityContent = await fetchLocalFile('personality.txt');

    // Scrape the websites (Example: WikiHow and stenoip.github.io)
    const wikiHowContent = await scrapeWebsite('https://www.wikihow.com/Main-Page');
    const stenoipContent = await scrapeWebsite('https://stenoip.github.io');

    // Combine all the fetched content
    const combinedContent = `
      ${moreInfoContent}\n\n
      ${personalityContent}\n\n
      WikiHow Content: \n${wikiHowContent}\n\n
      Stenoip Content: \n${stenoipContent}
    `;

    const payload = {
      contents: [...contents, { role: "system", parts: [{ text: combinedContent }] }],
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

