/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the 
Groq Chat Completions API using a direct fetch.
It injects custom context, including news headlines and site content, to ground the model's responses.

FIX: Switched from the deprecated Hugging Face Inference API to the Groq API.
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
// Groq Configuration
var GROQ_MODEL_ID = "llama3-8b-8192";
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// --- Helper Functions ---

async function getSiteContentFromFile() {
    // Path to the index.json file
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        var data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (error) {
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve content from index.json.";
    }
}

/**
 * Fetches and aggregates the top headlines from specified RSS feeds.
 */
async function getNewsContent() {
    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async function ([source, url]) {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            feed.items.slice(0, 3).forEach(function (item, index) {
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
    }
}

/**
 * Attempts to fetch content from the Groq API with retry logic using native fetch.
 */
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
                console.log(`Groq Rate Limit (429). Retrying in ${RETRY_DELAY / 1000} seconds...`);
                await new Promise(function (resolve) { return setTimeout(resolve, RETRY_DELAY); });
                return fetchFromModelWithRetry(payload, retries - 1);
            }
            
            var fetchError = new Error(`Groq API Error (${response.status}): ${errorMessage}`);
            fetchError.status = response.status;
            throw fetchError;
        }

        // Groq/OpenAI response format
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

    // 2. OPTIONS Pre-flight Check
    if (request.method === 'OPTIONS') {
        return response.status(200).end(); 
    }

    // 3. Method Check
    if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed"); 
    }

    try {
        // 4. API Key Check (Groq)
        var GROQ_API_KEY = process.env.GROQ_API_KEY; 
        if (!GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        
        var contents = request.body.contents;
        var system_instruction = request.body.system_instruction;

        // --- Fetch and Prepare Context ---
        var scrapedContent = await getSiteContentFromFile();
        var newsContent = await getNewsContent();

        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        var trimmedContent = scrapedContent;
        var baseInstruction = system_instruction && system_instruction.parts && system_instruction.parts[0] ? system_instruction.parts[0].text : "No additional instruction provided.";

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

        // --- DATA TRANSFORMATION (Groq uses 'system', 'user', 'assistant') ---
        var messages = [];

        // 1. Add System Prompt first
        messages.push({
            role: "system",
            content: combinedSystemInstruction
        });

        // 2. Append Chat History
        if (contents && Array.isArray(contents)) {
            contents.forEach(function (msg) {
                var role = (msg.role === 'model') ? 'assistant' : 'user';
                var text = msg.parts && msg.parts[0] ? msg.parts[0].text : "";
                
                if (text) {
                    messages.push({ role: role, content: text });
                }
            });
        }

        var payload = {
            messages: messages
        };

        // Fetch the generated content using the new Groq implementation
        var apiResponseText = await fetchFromModelWithRetry(payload);
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);

        if (error.status === 429) { 
            return response.status(429).json({
                error: "Rate limit exceeded. Please wait and try again.",
                retryAfter: "60 seconds"
            });
        }

        return response.status(500).json({
            error: "Failed to generate content.",
            details: error.message || "An unknown error occurred during content generation."
        });
    }
}
