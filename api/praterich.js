/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the 
Groq Chat Completions API using a direct fetch.
It injects custom context, including news headlines and site content, to ground the model's responses.
 
FIXES / CHANGES: 
1. Implemented News Caching (15 min) to minimize external requests.
2. Implemented Content Truncation to minimize tokens per request.
3. Reduced number of headlines included in the system prompt.
4. FIXED: Vision support — inlineData parts are now correctly converted to Groq's
   image_url content format, resolving the blank AI response bubble on image uploads.
*/

import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';

// --- Configuration ---
var parser = new Parser();
var NEWS_FEEDS = {
    BBC: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    CNN: 'http://rss.cnn.com/rss/cnn_topstories.rss'
};
var TIMEZONE = 'America/New_York';
var MAX_RETRIES = 3;  
var RETRY_DELAY = 5000;
// Groq Configuration — Llama 4 Scout supports vision (multimodal)
var GROQ_MODEL_ID = "meta-llama/llama-4-scout-17b-16e-instruct";
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// Token Saving Configuration
var MAX_CONTEXT_LENGTH = 2000;
var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// --- Global Cache ---
var newsCache = {
    content: null,
    timestamp: 0,
};

// --- Helper Functions ---

async function getSiteContentFromFile() {
    var filePath = path.join(process.cwd(), 'api', 'knowledge.txt');
    try {
        var data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (error) {
        console.error("Error reading knowledge.txt:", error.message);
        return "Error: Could not retrieve content from knowledge.txt.";
    }
}

async function getNewsContent() {
    if (newsCache.content && (Date.now() - newsCache.timestamp < NEWS_CACHE_EXPIRY_MS)) {
        return newsCache.content;
    }

    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async function ([source, url]) {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source} Top Story (Latest):**\n`;
            feed.items.slice(0, 1).forEach(function (item, index) { 
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        
        newsCache.content = newsText;
        newsCache.timestamp = Date.now();
        
        return newsText;
    } catch (error) {
        console.error("Error fetching RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news.]\n";
    }
}

/**
 * Converts the frontend's Gemini-style parts array into Groq's OpenAI-compatible
 */
function convertPartsToGroqContent(parts) {
    if (!parts || !Array.isArray(parts) || parts.length === 0) return '';

    var contentArray = [];

    parts.forEach(function(part) {
        if (part.text && part.text.trim() !== '') {
            contentArray.push({ type: 'text', text: part.text });
        } else if (part.inlineData && part.inlineData.data) {
            // Convert base64 image to Groq's image_url format
            contentArray.push({
                type: 'image_url',
                image_url: {
                    url: 'data:' + part.inlineData.mimeType + ';base64,' + part.inlineData.data
                }
            });
        }
    });

    if (contentArray.length === 0) return '';
    // If it's only a single text item, return a plain string (more efficient)
    if (contentArray.length === 1 && contentArray[0].type === 'text') {
        return contentArray[0].text;
    }
    return contentArray;
}

async function fetchFromModelWithRetry(payload, retries) {
    retries = retries === undefined ? MAX_RETRIES : retries;
    var GROQ_API_KEY = process.env.GROQ_API_KEY;

    var body = JSON.stringify({
        messages: payload.messages,
        model: GROQ_MODEL_ID,
        max_tokens: 1024,
        temperature: 0.7
    });

    try {
        var response = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: body
        });

        var data = await response.json();

        if (!response.ok) {
            var errorMessage = data.error && data.error.message ? data.error.message : response.statusText;
            
            if (response.status === 429 && retries > 0) {
                console.log(`Groq Rate Limit (429). Retrying in ${RETRY_DELAY / 1000}s...`);
                await new Promise(function (resolve) { return setTimeout(resolve, RETRY_DELAY); });
                return fetchFromModelWithRetry(payload, retries - 1);
            }
            
            var fetchError = new Error(`Groq API Error (${response.status}): ${errorMessage}`);
            fetchError.status = response.status;
            throw fetchError;
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error fetching from Groq:", error.message);
        throw error;
    }
}

// --- Main Vercel Handler ---

export default async function handler(request, response) {
    // 1. CORS Origin Check
    var allowedOrigins = [
        'https://stenoip.github.io', 
        'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'
    ];
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
        var GROQ_API_KEY = process.env.GROQ_API_KEY; 
        if (!GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        
        var contents = request.body.contents;
        var system_instruction = request.body.system_instruction;

        var scrapedContent = await getSiteContentFromFile();
        var newsContent = await getNewsContent();

        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        var trimmedContent = scrapedContent.length > MAX_CONTEXT_LENGTH 
            ? scrapedContent.substring(0, MAX_CONTEXT_LENGTH) + "...\n[Content truncated to save tokens.]" 
            : scrapedContent;
            
        var baseInstruction = system_instruction && system_instruction.parts && system_instruction.parts[0] 
            ? system_instruction.parts[0].text 
            : "No additional instruction provided.";

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
- **Important Website Information:**
  ${trimmedContent}
- **Latest Global News Headlines:**
  ${newsContent}

${PRAT_CONTEXT_INJ}
----------------------------------
`; 

        // --- DATA TRANSFORMATION ---
        // Converts Gemini-style parts (including inlineData images) to Groq/OpenAI format.
        var messages = [];

        messages.push({
            role: "system",
            content: combinedSystemInstruction
        });

        if (contents && Array.isArray(contents)) {
            contents.forEach(function (msg) {
                var role = (msg.role === 'model') ? 'assistant' : 'user';
                var groqContent = convertPartsToGroqContent(msg.parts);

                // Skip empty messages to avoid Groq validation errors
                if (!groqContent || groqContent === '' || (Array.isArray(groqContent) && groqContent.length === 0)) {
                    return;
                }

                messages.push({ role: role, content: groqContent });
            });
        }

        var payload = { messages: messages };

        var apiResponseText = await fetchFromModelWithRetry(payload);
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);

        var isTokenError = error.message && (error.message.includes('Request too large') || error.status === 429);

        if (isTokenError) { 
            return response.status(429).json({
                error: "Rate or Token limit exceeded. The conversation history may be too long.",
                retryAfter: "Consider starting a new conversation or reducing context."
            });
        }

        return response.status(500).json({
            error: "Failed to generate content.",
            details: error.message || "An unknown error occurred during content generation."
        });
    }
}
