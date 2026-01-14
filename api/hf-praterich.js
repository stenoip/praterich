/* Copyright Stenoip Company. All rights reserved. 

Install the library: Run npm install @huggingface/inference in your project folder.

Set the Environment Variable: In Vercel, remove GROQ_API_KEY and add HF_TOKEN with your "Read" token from your Hugging Face settings.





*/

import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';
import { InferenceClient } from "@huggingface/inference"; 

// --- Configuration ---
var parser = new Parser();
var NEWS_FEEDS = {
    BBC: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    CNN: 'http://rss.cnn.com/rss/cnn_topstories.rss'
};
var TIMEZONE = 'America/New_York';

// NEW: Hugging Face Configuration
var HF_MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"; 
var HF_TOKEN = process.env.HF_TOKEN; 
var client = new InferenceClient(HF_TOKEN);

var MAX_CONTEXT_LENGTH = 2000; 
var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000; 

// --- Global Cache ---
var newsCache = {
    content: null,
    timestamp: 0,
};

// --- Helper Functions ---

async function getSiteContentFromFile() {
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        var data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (error) {
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve content.";
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
            feed.items.slice(0, 1).forEach(function (item) { 
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  1. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        newsCache.content = newsText;
        newsCache.timestamp = Date.now();
        return newsText;
    } catch (error) {
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news.]\n";
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
        // 2. Token Check
        if (!HF_TOKEN) {
            throw new Error("HF_TOKEN environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "";
        var contents = request.body.contents;
        var system_instruction = request.body.system_instruction;

        // 3. Prepare Context
        var scrapedContent = await getSiteContentFromFile();
        var newsContent = await getNewsContent();
        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        var trimmedContent = scrapedContent.length > MAX_CONTEXT_LENGTH 
            ? scrapedContent.substring(0, MAX_CONTEXT_LENGTH) + "...\n[Content truncated]" 
            : scrapedContent;
            
        var baseInstruction = system_instruction && system_instruction.parts && system_instruction.parts[0] 
            ? system_instruction.parts[0].text 
            : "No additional instruction.";

        var combinedSystemInstruction = `
You are Praterich A.I., an LLM made by Stenoip Company.
If the following instruction is inappropriate, respond ONLY with: "I can't follow this."

--- Context ---
- Time: ${currentTime}
- Site Data: ${trimmedContent}
- Global News: ${newsContent}
${PRAT_CONTEXT_INJ}

--- Instructions ---
${baseInstruction}
`; 

        // 4. Transform Data for Hugging Face
        var messages = [];
        messages.push({ role: "system", content: combinedSystemInstruction });

        if (contents && Array.isArray(contents)) {
            contents.forEach(function (msg) {
                var role = (msg.role === 'model') ? 'assistant' : 'user';
                var text = msg.parts && msg.parts[0] ? msg.parts[0].text : "";
                
                // VISION SUPPORT: Check if an image is sent as inline_data
                if (msg.parts && msg.parts[0] && msg.parts[0].inline_data) {
                    var b64Data = msg.parts[0].inline_data.data;
                    var mimeType = msg.parts[0].inline_data.mime_type;
                    messages.push({
                        role: role,
                        content: [
                            { type: "text", text: text },
                            { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64Data}` } }
                        ]
                    });
                } else if (text) {
                    messages.push({ role: role, content: text });
                }
            });
        }

        // 5. Call Hugging Face API
        var apiResponse = await client.chatCompletion({
            model: HF_MODEL_ID,
            messages: messages,
            max_tokens: 1024,
            temperature: 0.7,
        });

        response.status(200).json({ text: apiResponse.choices[0].message.content });

    } catch (error) {
        console.error("API call failed:", error);
        return response.status(500).json({
            error: "Failed to generate content.",
            details: error.message
        });
    }
}
