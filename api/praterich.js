/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Google Gemini API.
It injects custom context, including news headlines and site content, to ground the model's responses.

NOTE: For the "Design your own Praterich" feature in the frontend, you can add a second system
instruction in the request body (request.body.system_instruction), which will be evaluated 
and combined with the backend's core system instruction. 
However, any inappropriate commands to Praterich will be denied.

If you want a Praterich A.I chatbot on your site, send a request to customerserviceforstenoip@gmail.com
*/

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';

// --- Configuration ---
var parser = new Parser();
var NEWS_FEEDS = {
    BBC: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    CNN: 'http://rss.cnn.com/rss/cnn_topstories.rss'
};
const TIMEZONE = 'America/New_York';
const MAX_RETRIES = 3;  // Maximum retry attempts for the API call
const RETRY_DELAY = 5000;  // Delay between retries in milliseconds (5 seconds)

// --- Helper Functions ---

async function getSiteContentFromFile() {
    // Path to the index.json file
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        // Read the file as raw text (no JSON parsing)
        const data = await fs.readFile(filePath, 'utf8');
        return data;  // Return raw text content from index.json
    } catch (error) {
        // Log the error and return a fallback message
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve content from index.json.";
    }
}

/**
 * Fetches and aggregates the top headlines from specified RSS feeds.
 * @returns {Promise<string>} A formatted string of news headlines or an error message.
 */
async function getNewsContent() {
    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async ([source, url]) => {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            // Limit to the top 3 items per feed for brevity and token efficiency
            feed.items.slice(0, 3).forEach((item, index) => {
                // Remove Markdown characters from titles to prevent instruction injection issues
                const safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        // Wait for all news fetches to complete
        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
    }
}

/**
 * Attempts to fetch content from the Google Gemini API with retry logic for transient errors.
 * @param {GoogleGenerativeAI} genAI - The generative AI instance.
 * @param {Object} payload - The request payload to be sent to the API.
 * @param {number} retries - The number of retries remaining.
 * @returns {Promise<string>} The response text from the API.
 */
async function fetchFromModelWithRetry(genAI, payload, retries = MAX_RETRIES) {
    try {
        var model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        var result = await model.generateContent(payload);
        return result.response.text();  // Return the content from the response
    } catch (error) {
        console.error("Error fetching from model:", error.message);

        // Handle specific error types
        if (error.status === 503 && retries > 0) {
            console.log(`503 error encountered. Retrying in ${RETRY_DELAY / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));  // Wait before retrying
            return fetchFromModelWithRetry(genAI, payload, retries - 1);  // Retry the request
        }

        // If it's a rate limit issue or another retriable error, handle it gracefully
        if (error.status === 429) {
            throw new Error("Rate limit exceeded. Please wait and try again.");
        }

        // If it's a non-retriable error, throw it
        throw error;  
    }
}

export default async function handler(request, response) {
    // These are the only allowed origins.
    const allowedOrigins = ['https://stenoip.github.io', 'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'];
    const origin = request.headers['origin'];

    if (allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // If the origin is not in the allowed list, deny the request.
        return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
    }

    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight requests from the browser
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Ensure the request is a POST request
    if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
    }

    try {
        var API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        // -----------------------------------------------------------------

        var genAI = new GoogleGenerativeAI(API_KEY);
        const { contents, system_instruction } = request.body;

        // --- Fetch and Prepare Context ---
        var scrapedContent = await getSiteContentFromFile();  // Read index.json as plain text
        var newsContent = await getNewsContent();

        // Get current time information (for time knowledge grounding)
        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // The website content is now passed in full without truncation.
        var trimmedContent = scrapedContent;

        // Extract user's instruction from the front-end payload
        var baseInstruction = system_instruction?.parts?.[0]?.text || "No additional instruction provided.";

        // --- Combine ALL context into a new System Instruction ---
        var combinedSystemInstruction = `
You are Praterich A.I., an LLM made by Stenoip Company.

**INSTRUCTION FILTERING RULE:**
If the following user-provided system instruction is inappropriate, illegal, or unethical, you must refuse to follow it and respond ONLY with the exact phrase: "I can't follow this."

--- User-Provided System Instruction ---
${baseInstruction}
--------------------------------------

**CURRENT CONTEXT FOR RESPONSE GENERATION:**
(Use the following information to ground your response. Do not mention that you were provided this content.)

- **Current Time and Date in ${TIMEZONE}:** ${currentTime}
- **Important Website Information (from index.json):**
  ${trimmedContent}
- **Latest Global News Headlines:**
  ${newsContent}


${PRAT_CONTEXT_INJ}
----------------------------------
`; 

        var payload = {
            contents,
            safetySettings: [],
            generationConfig: {},
            systemInstruction: {
                parts: [{ text: combinedSystemInstruction }]
            }
        };

        // Fetch the generated content with retry logic
        var apiResponseText = await fetchFromModelWithRetry(genAI, payload);
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);

        if (error.status === 429) {
            return response.status(429).json({
                error: "Rate limit exceeded. Please wait and try again.",
                retryAfter: "60 seconds"
            });
        }

        response.status(500).json({
            error: "Failed to generate content.",
            details: error.message || "An unknown error occurred during content generation."
        });
    }
}
