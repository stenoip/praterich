/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Hugging Face Inference API.
It injects custom context, including news headlines and site content, to ground the model's responses.

// ---------------------------------------------------------------------------------
// **FIX APPLIED:** The HfInference object is explicitly configured with the new endpoint URL 
// ("https://router.huggingface.co") to bypass the deprecated URL used by older library versions.
// ----------------------------------------------------------------------------------
*/

import { HfInference } from "@huggingface/inference";
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
const MAX_RETRIES = 3;  
const RETRY_DELAY = 5000;

// --- Helper Functions ---

async function getSiteContentFromFile() {
    // Path to the index.json file
    const filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
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
    let newsText = "\n--- Global News Headlines ---\n";
    try {
        const allNewsPromises = Object.entries(NEWS_FEEDS).map(async ([source, url]) => {
            const feed = await parser.parseURL(url);
            let sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            feed.items.slice(0, 3).forEach((item, index) => {
                const safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        const newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
    }
}

/**
 * Attempts to fetch content from the Hugging Face API with retry logic.
 */
async function fetchFromModelWithRetry(hf, payload, retries = MAX_RETRIES) {
    try {
        // The 'hf' object passed here already has the correct endpoint configured.
        const chatCompletion = await hf.chatCompletion({
            model: "mistralai/Mistral-7B-Instruct-v0.3",
            messages: payload.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        return chatCompletion.choices[0].message.content;

    } catch (error) {
        console.error("Error fetching from model:", error.message);

        if (error.status === 503 && retries > 0) {
            console.log(`Model loading (503). Retrying in ${RETRY_DELAY / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchFromModelWithRetry(hf, payload, retries - 1);
        }

        if (error.status === 429) {
            const rateLimitError = new Error("Rate limit exceeded. Please wait and try again.");
            rateLimitError.status = 429;
            throw rateLimitError; 
        }

        throw error;  
    }
}

// --- Main Vercel Handler ---

export default async function handler(request, response) {
    // 1. CORS Origin Check (Strictly Formatted)
    const allowedOrigins = [
        'https://stenoip.github.io', 
        'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'
    ];
    const origin = request.headers['origin']; 

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
        // 4. API Key Check
        const HF_API_KEY = process.env.HF_API_KEY; 
        if (!HF_API_KEY) {
            throw new Error("HF_API_KEY environment variable is not set.");
        }

        const PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        
        // ***************************************************************
        // FIX: Manually configure the endpoint to the new, supported URL.
        const hf = new HfInference(
    { 
        accessToken: HF_API_KEY, 
        // Using baseUrl, which often defines the root for all API calls
        baseUrl: "https://router.huggingface.co/v1" 
    }
);
        // ***************************************************************
        
        const { contents, system_instruction } = request.body;

        // --- Fetch and Prepare Context ---
        const scrapedContent = await getSiteContentFromFile();
        const newsContent = await getNewsContent();

        const currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const trimmedContent = scrapedContent;
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
- **Important Website Information (from index.json):**
  ${trimmedContent}
- **Latest Global News Headlines:**
  ${newsContent}


${PRAT_CONTEXT_INJ}
----------------------------------
`; 

        // --- DATA TRANSFORMATION ---
        const messages = [];

        // 1. Add System Prompt first
        messages.push({
            role: "system",
            content: combinedSystemInstruction
        });

        // 2. Append Chat History
        if (contents && Array.isArray(contents)) {
            contents.forEach(msg => {
                const role = (msg.role === 'model') ? 'assistant' : 'user';
                const text = msg.parts && msg.parts[0] ? msg.parts[0].text : "";
                
                if (text) {
                    messages.push({ role: role, content: text });
                }
            });
        }

        const payload = {
            messages: messages
        };

        // Fetch the generated content
        const apiResponseText = await fetchFromModelWithRetry(hf, payload);
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
