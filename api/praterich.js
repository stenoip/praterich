/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Google Gemini API.
It includes caching for news and site content to reduce API token usage and latency.


*/

var GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;
var fs = require('fs/promises');
var path = require('path');
var Parser = require('rss-parser');

// --- Configuration ---
var parser = new Parser();
var NEWS_FEEDS = {
    BBC: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    CNN: 'http://rss.cnn.com/rss/cnn_topstories.rss'
};
var TIMEZONE = 'America/New_York';
var MAX_RETRIES = 3;      // Maximum retry attempts for the API call
var RETRY_DELAY = 5000;   // Delay between retries in milliseconds (5 seconds)
var NEWS_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- Caching Variables (These will persist across function invocations in Vercel's lifecycle) ---
var cachedNewsContent = "";
var lastNewsFetchTime = 0;
var cachedSiteContent = null;
var SITE_CONTENT_FILE_PATH = path.join(process.cwd(), 'api', 'index.json');

// --- Helper Functions ---

/**
 * Reads the site content file once and caches it.
 * @returns {Promise<string>} The raw text content from index.json.
 */
async function getSiteContentFromFile() {
    if (cachedSiteContent !== null) {
        return cachedSiteContent; // Return cached content immediately
    }
    
    // If not cached, read the file
    try {
        var data = await fs.readFile(SITE_CONTENT_FILE_PATH, 'utf8');
        cachedSiteContent = data; // Cache the data
        console.log("Site content loaded and cached.");
        return data;
    } catch (error) {
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve content from index.json.";
    }
}

/**
 * Fetches and aggregates the top headlines from specified RSS feeds, using a time-based cache.
 * @returns {Promise<string>} A formatted string of news headlines or an error message.
 */
async function getNewsContent() {
    var currentTime = Date.now();
    
    // Check if the cache is still valid (15 minutes)
    if (currentTime - lastNewsFetchTime < NEWS_CACHE_DURATION && cachedNewsContent) {
        return cachedNewsContent; // Use cached content
    }

    // Cache is expired or empty, fetch new content
    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async function ([source, url]) {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            // Limit to the top 3 items per feed
            feed.items.slice(0, 3).forEach(function (item, index) {
                // Remove Markdown characters
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        // Wait for all news fetches to complete
        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        
        // Update cache and timestamp
        cachedNewsContent = newsText;
        lastNewsFetchTime = currentTime;
        console.log("News content refreshed and cached.");

        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        // Fallback: return the last good cache if it exists, otherwise an error message
        return cachedNewsContent || "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
    }
}

/**
 * Attempts to fetch content from the Google Gemini API with retry logic.
 */
async function fetchFromModelWithRetry(genAI, payload, retries) {
    if (typeof retries === 'undefined') {
        retries = MAX_RETRIES;
    }
    
    try {
        // Explicitly set the model to the lower usage tier
        var model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
        var result = await model.generateContent(payload);
        return result.response.text(); 
    } catch (error) {
        console.error("Error fetching from model:", error.message);

        // Check for rate limit error explicitly
        if (error.message.includes('429') || error.message.includes('Rate limit exceeded')) {
            var rateLimitError = new Error("Rate limit exceeded.");
            rateLimitError.status = 429;
            throw rateLimitError;
        }

        // Handle 503 errors with retry logic
        if ((error.status === 503 || error.message.includes('503')) && retries > 0) {
            console.log(`503 error encountered. Retrying in ${RETRY_DELAY / 1000} seconds...`);
            await new Promise(function (resolve) {
                setTimeout(resolve, RETRY_DELAY);
            }); 
            return fetchFromModelWithRetry(genAI, payload, retries - 1); 
        }

        // For all other errors, just throw it
        throw error;  
    }
}

// --- Vercel Serverless Function Handler ---

module.exports = async function handler(request, response) {
    // --- CORS and Method Handling ---
    var allowedOrigins = ['https://stenoip.github.io', 'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'];
    var origin = request.headers['origin'];

    if (allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
    }

    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
    }

    try {
        var API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        var genAI = new GoogleGenerativeAI(API_KEY);
        var contents = request.body.contents;
        var system_instruction = request.body.system_instruction;

        // --- Fetch Cached or Fresh Context ---
        var scrapedContent = await getSiteContentFromFile(); // Uses cache
        var newsContent = await getNewsContent();            // Uses cache

        // Get current time information (for time knowledge grounding)
        var dateOptions = {
            timeZone: TIMEZONE,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        var currentTime = new Date().toLocaleString('en-US', dateOptions);

        var trimmedContent = scrapedContent;
        // Accessing deeply nested object property safely
        var baseInstruction = (system_instruction && system_instruction.parts && system_instruction.parts[0] && system_instruction.parts[0].text) || "No additional instruction provided.";

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
            contents: contents,
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

        // Handle the explicit rate limit error (status 429)
        if (error.status === 429 || error.message.includes("Rate limit exceeded")) {
            return response.status(429).json({
                error: "Rate limit exceeded. Please wait and try again.",
                details: "Your quota for the Gemini API has been reached. Consider requesting a limit increase.",
                retryAfter: "60 seconds"
            });
        }

        response.status(500).json({
            error: "Failed to generate content.",
            details: error.message || "An unknown error occurred during content generation."
        });
    }
};
