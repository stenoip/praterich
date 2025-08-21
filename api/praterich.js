// api/praterich.js

// Use dynamic import to handle ESM in Vercel's Node 18+ runtime
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // --- CORS headers ---
  res.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Restrict requests to your allowed origin
  const origin = req.headers.origin;
  if (origin !== 'https://stenoip.github.io') {
    return res.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error('API_KEY environment variable is not set.');
    }

    // Init Gemini
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const { contents, system_instruction } = req.body;

    // Load external files
    const moreInfoContent = await fetchExternalFile('more_info.txt');
    const personalityContent = await fetchExternalFile('personality.txt');

    // Crawl optional page
    const wikiHowContent = await crawlWebsite('https://www.wikihow.com/Main-Page');

    const payload = {
      contents: contents.concat([
        {
          role: 'system',
          parts: [
            { text: moreInfoContent },
            { text: personalityContent },
            { text: wikiHowContent }
          ]
        }
      ]),
      safetySettings: [],
      generationConfig: {}
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    res.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error('API call failed:', error);
    res.status(500).json({ error: 'Failed to generate content.', details: error.message });
  }
}

// --- Helpers ---
async function fetchExternalFile(fileName) {
  const fileUrl = `https://stenoip.github.io/${fileName}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
  return await res.text();
}

async function crawlWebsite(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to crawl ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  return $('p').first().text();
}
