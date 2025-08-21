import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch'; // Required for fetching external resources like txt files

export default async function handler(request, response) {
  // Set CORS headers to allow requests from your GitHub Pages domain
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests (OPTIONS request)
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Check the Origin header to ensure the request is from your GitHub Pages site.
  // This is a crucial security measure.
  const origin = request.headers['origin'];
  if (origin !== 'https://stenoip.github.io') {
    return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  // Ensure POST method
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

    // Fetch additional data from external resources
    const moreInfoContent = await fetchExternalFile('more_info.txt');
    const personalityContent = await fetchExternalFile('personality.txt');

    const payload = {
      contents: contents.concat([{ role: 'system', parts: [{ text: moreInfoContent }, { text: personalityContent }] }]),
      safetySettings: [],
      generationConfig: {},
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    // Requesting content from the generative AI model
    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}

// Fetch content from the specified file URL (more_info.txt, personality.txt, etc.)
async function fetchExternalFile(fileName) {
  try {
    const fileUrl = `https://stenoip.github.io/praterich/${fileName}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${fileName}`);
    }
    const content = await res.text();
    return content;
  } catch (error) {
    console.error(`Error fetching file ${fileName}:`, error);
    throw new Error(`Could not load content from ${fileName}`);
  }
}
