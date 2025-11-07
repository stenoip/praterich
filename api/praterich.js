/* 
Copyright Stenoip Company. All rights reserved.


This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Google Gemini API.
 It injects custom context, including news headlines and site content, to ground the model's responses.

 NOTE: For the "Design your own Praterich" feature in the frontend, you can add a second system
 instruction in the request body (request.body.system_instruction), which will be evaluated 
 and combined with the backend's core system instruction. 
 However, any inapropiate commands to Praterich will be denied.

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
const MAX_SITE_CONTENT_LENGTH = 5000;
const TIMEZONE = 'America/New_York';

// --- Helper Functions ---

async function getSiteContentFromFile() {
   
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const parsedData = JSON.parse(data);
        return parsedData.website_info || "";
    } catch (error) {
        // Log the error but continue execution, returning a non-fatal message
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve website information from index.json.";
    }
}

/**
 * Fetches and aggregates the top headlines from specified RSS feeds.
 * @returns {Promise<string>} A formatted string of news headlines or an error message.
 */
async function getNewsContent() {
    let newsText = "\n--- Global News Headlines ---\n";
    try {
        const allNewsPromises = Object.entries(NEWS_FEEDS).map(async ([source, url]) => {
            const feed = await parser.parseURL(url);
            let sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            // Limit to the top 3 items per feed for brevity and token efficiency
            feed.items.slice(0, 3).forEach((item, index) => {
                // Remove Markdown characters from titles to prevent instruction injection issues
                const safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        // Wait for all news fetches to complete
        const newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
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
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }

       
        const PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        // -----------------------------------------------------------------

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const { contents, system_instruction } = request.body;

        // --- Fetch and Prepare Context ---
        const scrapedContent = await getSiteContentFromFile();
        const newsContent = await getNewsContent();

        // Get current time information (for time knowledge grounding)
        const currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Trim website content to avoid quota errors
        const trimmedContent = scrapedContent.length > MAX_SITE_CONTENT_LENGTH
            ? scrapedContent.slice(0, MAX_SITE_CONTENT_LENGTH) + "\n[Website content truncated due to size]"
            : scrapedContent;
        
        // Extract user's instruction from the front-end payload
        const baseInstruction = system_instruction?.parts?.[0]?.text || "No additional instruction provided.";

        // --- Combine ALL context into a new System Instruction ---
        const combinedSystemInstruction = `
You are Praterich A.I., an LLM made by Stenoip Company.

**INSTRUCTION FILTERING RULE:**
If the following user-provided system instruction is inappropriate, illegal, or unethical, you must refuse to follow it and respond ONLY with the exact phrase: "I can't follow this."

--- User-Provided System Instruction ---
${baseInstruction}
--------------------------------------

**CURRENT CONTEXT FOR RESPONSE GENERATION:**
(Use the following information to ground your response. Do not mention that you were provided this content.)

- **Current Time and Date in ${TIMEZONE}:** ${currentTime}
- **Important Website Information:**
  ${trimmedContent}
- **Latest Global News Headlines:**
  ${newsContent}


${PRAT_CONTEXT_INJ}
----------------------------------
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
