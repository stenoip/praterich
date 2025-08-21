import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch'; // Required for fetching external resources like txt files
import cheerio from 'cheerio'; // For crawling and parsing HTML pages

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
    // Ensure API_KEY is available in environment variables
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }

    // Initialize Google Generative AI
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Get contents and optional system_instruction from the request body
    const { contents, system_instruction } = request.body;

    // Fetch additional data from external files like more_info.txt and personality.txt
    const moreInfoContent = await fetchExternalFile('more_info.txt');
    const personalityContent = await fetchExternalFile('personality.txt');

    // Optionally crawl a website like wikiHow for more info (if needed)
    const wikiHowContent = await crawlWebsite('https://www.wikihow.com/Main-Page');

    // Prepare the payload for the generative AI model
    const payload = {
      contents: contents.concat([{ role: 'system', parts: [{ text: moreInfoContent }, { text: personalityContent }, { text: wikiHowContent }] }]),
      safetySettings: [],
      generationConfig: {},
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    // Request content generation from the AI model
    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    // Respond with the generated content
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    // Catch any errors and send a 500 response
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}

// Helper function to fetch content from external text files (more_info.txt, personality.txt, etc.)
async function fetchExternalFile(fileName) {
  try {
    // Construct the URL for the file (assuming it's hosted on GitHub Pages)
    const fileUrl = `https://stenoip.github.io/praterich/${fileName}`;
    const res = await fetch(fileUrl);

    // If the response is not okay, throw an error
    if (!res.ok) {
      throw new Error(`Failed to fetch ${fileName}`);
    }

    // Return the content of the file as text
    const content = await res.text();
    return content;
  } catch (error) {
    // Log and throw the error if fetching fails
    console.error(`Error fetching file ${fileName}:`, error);
    throw new Error(`Could not load content from ${fileName}`);
  }
}

// Helper function to crawl a website and fetch text content (using Cheerio)
async function crawlWebsite(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to crawl ${url}`);
    }

    // Parse the HTML content using Cheerio (similar to jQuery)
    const html = await res.text();
    const $ = cheerio.load(html);

    // Example: extract the first paragraph text from the page
    const firstParagraph = $('p').first().text();
    return firstParagraph; // Return just the first paragraph (or adapt as needed)
  } catch (error) {
    console.error(`Error crawling website ${url}:`, error);
    throw new Error(`Failed to crawl website: ${url}`);
  }
}
