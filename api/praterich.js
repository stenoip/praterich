import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch'; // Assuming you're using fetch to get external files

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

    // Check if we have the contents and system instruction
    if (!contents) {
      throw new Error("Contents not provided in the request.");
    }

    const payload = {
      contents,
      safetySettings: [],
      generationConfig: {},
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    // Attempt to fetch more_info.txt or personality.txt if needed
    const moreInfoContent = await fetchFileContent('more_info.txt');
    const personalityContent = await fetchFileContent('personality.txt');

    // Optional: Combine fetched content with user content (this is an example)
    contents.push({ role: "system", parts: [{ text: moreInfoContent }, { text: personalityContent }] });

    // Now call the GoogleGenerativeAI API
    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);  // Log full error details
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}

// Helper function to fetch content from an external file hosted on GitHub Pages
async function fetchFileContent(fileName) {
  try {
    // Make sure to adjust the URL to the correct file path on your GitHub Pages
    const res = await fetch(`https://stenoip.github.io/${fileName}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${fileName}: ${res.statusText}`);
    }
    return await res.text();  // Read and return the text content of the file
  } catch (err) {
    console.error(`Error fetching ${fileName}:`, err.message);  // Log the error
    throw new Error(`Error fetching ${fileName}`);
  }
}
