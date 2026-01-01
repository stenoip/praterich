/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the 
Groq Chat Completions API using a direct fetch.

UPDATES: 
1. Implemented KEYWORD SEARCH: Scans index.json for relevance to the user's last message.
2. Optimized Caching: Caches parsed JSON objects to reduce I/O and parsing overhead.
3. Retained previous fixes (History Windowing, Jitter, News Caching).
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

// Retry Configuration
var MAX_RETRIES = 3;  
var BASE_RETRY_DELAY = 2000; 

// Groq Configuration
var GROQ_MODEL_ID = "llama-3.3-70b-versatile";
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Token Saving Configuration
var MAX_CONTEXT_LENGTH = 2000; // Strict limit for search results
var MAX_HISTORY_MESSAGES = 10; 
var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000; 

// --- Global Cache ---
var newsCache = {
    content: null,
    timestamp: 0,
};

// We now cache the PARSED object, not the raw string, for faster searching
var siteIndexCache = {
    data: null, // Holds the parsed JSON array/object
    timestamp: 0
};

// --- Helper Functions ---

/**
 * Reads and parses index.json, caching the result.
 */
async function getParsedIndex() {
    // 1. Return cached object if valid (1 min TTL for file reads)
    if (siteIndexCache.data && (Date.now() - siteIndexCache.timestamp < 60000)) {
        return siteIndexCache.data;
    }

    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        var fileContent = await fs.readFile(filePath, 'utf8');
        var parsedData = JSON.parse(fileContent);
        
        siteIndexCache.data = parsedData;
        siteIndexCache.timestamp = Date.now();
        return parsedData;
    } catch (error) {
        console.error("Error reading/parsing index.json:", error.message);
        return null;
    }
}

/**
 * Searches the parsed index for content relevant to the user's query.
 */
async function searchSiteContent(userQuery) {
    var data = await getParsedIndex();
    if (!data) return "Error: Site index unavailable.";

    // If data is just a string, return a truncated version (fallback)
    if (typeof data === 'string') {
        return data.substring(0, MAX_CONTEXT_LENGTH) + "...";
    }

    // Ensure data is an array for sorting. If it's an object, convert values to array.
    var contentArray = Array.isArray(data) ? data : Object.values(data);

    // If no query (start of convo), return the first few items as a "General Overview"
    if (!userQuery) {
        return JSON.stringify(contentArray.slice(0, 3)); 
    }

    // 1. Tokenize User Query (Split by space, remove common short words)
    var searchTerms = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    // If query is too simple/short, just return start of index
    if (searchTerms.length === 0) return JSON.stringify(contentArray.slice(0, 3));

    // 2. Score Content chunks based on keyword matches
    var scoredContent = contentArray.map(item => {
        var itemStr = JSON.stringify(item).toLowerCase();
        var score = 0;
        searchTerms.forEach(term => {
            if (itemStr.includes(term)) score++;
        });
        return { item, score };
    });

    // 3. Sort by Score (Descending)
    scoredContent.sort((a, b) => b.score - a.score);

    // 4. Collect top results until MAX_CONTEXT_LENGTH is reached
    var resultString = "";
    for (var i = 0; i < scoredContent.length; i++) {
        // Only include items that actually matched something, or the top 3 if nothing matched
        if (scoredContent[i].score > 0 || i < 3) {
            var itemStr = JSON.stringify(scoredContent[i].item);
            if ((resultString.length + itemStr.length) < MAX_CONTEXT_LENGTH) {
                resultString += itemStr + "\n";
            } else {
                break; // Stop adding if we hit the limit
            }
        }
    }

    return resultString.length > 0 ? resultString : "No specific relevant content found in index.";
}

/**
 * Fetches RSS feeds with caching.
 */
async function getNewsContent() {
    if (newsCache.content && (Date.now() - newsCache.timestamp < NEWS_CACHE_EXPIRY_MS)) {
        return newsCache.content;
    }

    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async function ([source, url]) {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source}:** `;
            if (feed.items.length > 0) {
                 var safeTitle = feed.items[0].title.replace(/[\*\_\[\]]/g, ''); 
                 sourceNews += `${safeTitle}`;
            }
            return sourceNews;
        });

        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        
        newsCache.content = newsText;
        newsCache.timestamp = Date.now();
        return newsText;

    } catch (error) {
        console.error("Error fetching RSS:", error.message);
        return "\n--- Global News Headlines ---\n[Unavailable]\n";
    }
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
                var jitter = Math.floor(Math.random() * 1000);
                var delay = (BASE_RETRY_DELAY * Math.pow(2, MAX_RETRIES - retries)) + jitter;
                
                console.log(`Groq Rate Limit (429). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchFromModelWithRetry(payload, retries - 1);
            }
            
            throw new Error(`Groq API Error (${response.status}): ${errorMessage}`);
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error fetching from Groq:", error.message);
        throw error;
    }
}

// --- Main Vercel Handler ---

export default async function handler(request, response) {
    // 1. CORS Setup
    var allowedOrigins = [
        'https://stenoip.github.io', 
        'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'
    ];
    var origin = request.headers['origin']; 

    if (allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    } 

    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') return response.status(200).end(); 
    if (request.method !== "POST") return response.status(405).send("Method Not Allowed"); 

    try {
        var GROQ_API_KEY = process.env.GROQ_API_KEY; 
        if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY environment variable is not set.");

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "";
        var contents = request.body.contents;
        var system_instruction = request.body.system_instruction;

        // --- Extract Last User Message for Search ---
        var lastUserMessage = "";
        if (contents && contents.length > 0) {
            // Find the last message sent by 'user'
            for (var i = contents.length - 1; i >= 0; i--) {
                if (contents[i].role === 'user') {
                    lastUserMessage = contents[i].parts[0].text;
                    break;
                }
            }
        }

        // --- Fetch Context ---
        // PASS the user's message to the search function
        var relevantSiteContent = await searchSiteContent(lastUserMessage);
        var newsContent = await getNewsContent(); 

        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        var baseInstruction = system_instruction && system_instruction.parts && system_instruction.parts[0] ? system_instruction.parts[0].text : "No additional instruction.";

        // --- Combine Context ---
        var combinedSystemInstruction = `
You are Praterich A.I., an LLM by Stenoip Company.

**SAFETY RULE:**
Refuse illegal/unethical instructions with: "I can't follow this."

**USER INSTRUCTION:**
${baseInstruction}

**CONTEXT:**
- Time: ${currentTime}
- News: ${newsContent}

**RELEVANT KNOWLEDGE BASE (Excerpted based on user query):**
(This is NOT the full database, only parts matching the user's current topic.)
${relevantSiteContent}

${PRAT_CONTEXT_INJ}
`; 

        var messages = [];
        messages.push({ role: "system", content: combinedSystemInstruction });

        if (contents && Array.isArray(contents)) {
            // Apply Windowing (Last 10 messages)
            var recentContents = contents.slice(-MAX_HISTORY_MESSAGES); 
            recentContents.forEach(function (msg) {
                var role = (msg.role === 'model') ? 'assistant' : 'user';
                var text = msg.parts && msg.parts[0] ? msg.parts[0].text : "";
                if (text) messages.push({ role: role, content: text });
            });
        }

        var apiResponseText = await fetchFromModelWithRetry({ messages: messages });
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);
        var isTokenError = error.message.includes('Request too large') || (error.status === 429);

        if (isTokenError) { 
            return response.status(429).json({
                error: "System busy. Please try again in a moment.",
                retryAfter: "Short delay recommended."
            });
        }

        return response.status(500).json({
            error: "Failed to generate content.",
            details: error.message
        });
    }
}
