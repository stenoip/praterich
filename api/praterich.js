/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the 
Groq Chat Completions API using a direct fetch.
It injects custom context, including news headlines and site content, to ground the model's responses.
 
FIXES: 
1. Implemented News Caching (15 min) to minimize external requests.
2. Implemented Content Search/Filtering to minimize tokens while keeping index.json useful.
3. Reduced number of headlines included in the system prompt.
4. Added Chat History truncation to stay within Rate Limits (429).
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
var RETRY_DELAY = 6000;
// Groq Configuration
var GROQ_MODEL_ID = "llama-3.3-70b-versatile";
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// Token Saving Configuration
var MAX_CONTEXT_LENGTH = 3000; // Total allowed characters for injected context
var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// --- Global Cache ---
var newsCache = {
    content: null,
    timestamp: 0,
};

// --- Helper Functions ---

/**
 * Performs a basic keyword search on the index.json content.
 * Splits the file into chunks and returns only those containing keywords from the query.
 */
async function searchIndexContent(query) {
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        var data = await fs.readFile(filePath, 'utf8');
        
        if (!query) return data.substring(0, MAX_CONTEXT_LENGTH);

        // Simple Search Logic: Split by double newlines or sentences
        var sections = data.split(/\n\n|\. /);
        var keywords = query.toLowerCase().split(' ').filter(word => word.length > 3);
        
        var relevantSections = sections.filter(section => {
            return keywords.some(kw => section.toLowerCase().includes(kw));
        });

        // If no matches, return the start of the file. Otherwise, join matches.
        var result = relevantSections.length > 0 
            ? relevantSections.join('\n\n') 
            : data.substring(0, MAX_CONTEXT_LENGTH);

        return result.substring(0, MAX_CONTEXT_LENGTH);
    } catch (error) {
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve relevant context.";
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
            var sourceNews = `\n**${source} Top Story:**\n`;
            feed.items.slice(0, 1).forEach(function (item) { 
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  - ${safeTitle}\n`;
            });
            return sourceNews;
        });

        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        newsCache.content = newsText;
        newsCache.timestamp = Date.now();
        return newsText;
    } catch (error) {
        return "\n--- Global News Headlines ---\n[News Unavailable]\n";
    }
}

async function fetchFromModelWithRetry(payload, retries) {
    retries = retries === undefined ? MAX_RETRIES : retries;
    var GROQ_API_KEY = process.env.GROQ_API_KEY;

    try {
        var response = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                messages: payload.messages,
                model: GROQ_MODEL_ID,
                max_tokens: 1024,
                temperature: 0.7
            })
        });

        var data = await response.json();

        if (response.status === 429 && retries > 0) {
            console.log(`429 Error: Retrying in ${RETRY_DELAY/1000}s...`);
            await new Promise(res => setTimeout(res, RETRY_DELAY));
            return fetchFromModelWithRetry(payload, retries - 1);
        }

        if (!response.ok) throw new Error(data.error?.message || "Groq API Error");
        return data.choices[0].message.content;
    } catch (error) {
        throw error;
    }
}

// --- Main Vercel Handler ---

export default async function handler(request, response) {
    var allowedOrigins = ['https://stenoip.github.io', 'https://www.khanacademy.org'];
    var origin = request.headers['origin']; 
    if (allowedOrigins.some(o => origin?.includes(o))) response.setHeader('Access-Control-Allow-Origin', origin);

    if (request.method === 'OPTIONS') return response.status(200).end(); 
    if (request.method !== "POST") return response.status(405).send("Method Not Allowed"); 

    try {
        var GROQ_API_KEY = process.env.GROQ_API_KEY; 
        if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set.");

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "";
        var contents = request.body.contents || [];
        var system_instruction = request.body.system_instruction;

        // Get user's latest query for searching
        var lastUserMessage = contents.filter(m => m.role !== 'model').pop();
        var userQuery = lastUserMessage?.parts?.[0]?.text || "";

        // --- Fetch Context using Search ---
        var [scrapedContent, newsContent] = await Promise.all([
            searchIndexContent(userQuery),
            getNewsContent()
        ]);

        var currentTime = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
        var baseInstruction = system_instruction?.parts?.[0]?.text || "No additional instruction.";

        var combinedSystemInstruction = `
You are Praterich A.I., an LLM made by Stenoip Company.
--- User-Provided System Instruction ---
${baseInstruction}
--------------------------------------
**CURRENT CONTEXT:**
- Time: ${currentTime}
- Relevant Website Info: ${scrapedContent}
- News: ${newsContent}
${PRAT_CONTEXT_INJ}
`; 

        var messages = [{ role: "system", content: combinedSystemInstruction }];

        // LIMIT HISTORY: Only take the last 8 messages to prevent token bloat
        var historyLimit = contents.slice(-8);
        historyLimit.forEach(function (msg) {
            var role = (msg.role === 'model') ? 'assistant' : 'user';
            var text = msg.parts?.[0]?.text || "";
            if (text) messages.push({ role: role, content: text });
        });

        var apiResponseText = await fetchFromModelWithRetry({ messages: messages });
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);
        var is429 = error.status === 429 || error.message.includes('429');
        response.status(is429 ? 429 : 500).json({ error: error.message });
    }
}
