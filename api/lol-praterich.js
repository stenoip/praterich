/* Copyright Stenoip Company. All rights reserved.
   PROXY: Redirects to Stenoip Company's L.O.L disc 
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
var PENGUIN_ENDPOINT = 'https://penguin.tail6139c3.ts.net/5V20Y59YU1SqCN0IFIjEWA';
var MAX_CONTEXT_LENGTH = 2000;
var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000;

var newsCache = {
    content: null,
    timestamp: 0,
};

// --- Helper Functions ---

async function getSiteContentFromFile() {
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
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
            var safeTitle = feed.items[0].title.replace(/[\*\_\[\]]/g, '');
            return `\n**${source} Top Story:** ${safeTitle}\n`;
        });
        var newsResults = await Promise.all(allNewsPromises);
        newsCache.content = newsText + newsResults.join('');
        newsCache.timestamp = Date.now();
        return newsCache.content;
    } catch (error) {
        return "\n--- Global News Headlines ---\n[News unavailable]\n";
    }
}

// --- Main Vercel Handler ---

export default async function handler(request, response) {
    // 1. CORS
    var allowedOrigins = ['https://stenoip.github.io', 'https://www.khanacademy.org'];
    var origin = request.headers['origin']; 
    if (origin && (origin.startsWith('https://stenoip.github.io') || origin.includes('khanacademy.org'))) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    }
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') return response.status(200).end();
    if (request.method !== "POST") return response.status(405).send("Method Not Allowed");

    try {
        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "";
        var { contents, system_instruction } = request.body;

        var scrapedContent = await getSiteContentFromFile();
        var newsContent = await getNewsContent();
        var currentTime = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });

        var trimmedContent = scrapedContent.length > MAX_CONTEXT_LENGTH 
            ? scrapedContent.substring(0, MAX_CONTEXT_LENGTH) + "..." 
            : scrapedContent;
            
        var baseInstruction = system_instruction?.parts?.[0]?.text || "No instructions.";

        // Construct the prompt for Disc (Gemma:2b)
        var fullPrompt = `
System Instruction: ${baseInstruction}
Context: Time is ${currentTime}. Site info: ${trimmedContent}. News: ${newsContent}. ${PRAT_CONTEXT_INJ}
Conversation History:
${(contents || []).map(m => `${m.role}: ${m.parts?.[0]?.text}`).join('\n')}
assistant:`;

        // 2. Fetch from Disc Server with Streaming Consumption
        const penguinRes = await fetch(PENGUIN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: fullPrompt })
        });

        if (!penguinRes.ok) throw new Error(`Penguin Server Error: ${penguinRes.status}`);

        // 3. Collect Stream into a single string for non-streaming frontends
        const reader = penguinRes.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let finished = false;

        while (!finished) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            // Extract text from SSE format "data: text\n\n"
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.replace('data: ', '').trim();
                    if (data === '[DONE]') {
                        finished = true;
                    } else if (!data.startsWith('[ERROR]')) {
                        fullText += data;
                    }
                }
            }
        }

        // Return standard JSON response
        response.status(200).json({ text: fullText.trim() });

    } catch (error) {
        console.error("Pipeline Error:", error);
        response.status(500).json({ error: "Generation failed", details: error.message });
    }
}
