/* Copyright Stenoip Company. All rights reserved.



FIXES:
- Prevents 413/429 by strictly capping the TOTAL request size at 1,500 tokens.
- Dynamic Trimming: If the prompt is long, it will automatically drop oldest messages first.
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
var GROQ_MODEL_ID = "llama-3.3-70b-versatile";
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Strict budget for 20 users
var MAX_TOTAL_TOKENS = 1500; 
var CHARS_PER_TOKEN = 3.5;

var NEWS_CACHE_EXPIRY_MS = 15 * 60 * 1000; 
var newsCache = { content: null, timestamp: 0 };
var siteIndexCache = { data: null, timestamp: 0 };

// --- Helpers ---

function estimateTokens(text) {
    return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

async function getParsedIndex() {
    if (siteIndexCache.data && (Date.now() - siteIndexCache.timestamp < 60000)) return siteIndexCache.data;
    try {
        var data = await fs.readFile(path.join(process.cwd(), 'api', 'index.json'), 'utf8');
        siteIndexCache.data = JSON.parse(data);
        siteIndexCache.timestamp = Date.now();
        return siteIndexCache.data;
    } catch (e) { return null; }
}

async function searchSiteContent(query) {
    var data = await getParsedIndex();
    if (!data) return "No site data.";
    var contentArray = Array.isArray(data) ? data : Object.values(data);
    if (!query) return JSON.stringify(contentArray.slice(0, 1));

    var terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    var scored = contentArray.map(item => {
        var str = JSON.stringify(item).toLowerCase();
        var s = 0;
        terms.forEach(t => { if (str.includes(t)) s++; });
        return { item, s };
    }).sort((a, b) => b.s - a.s);

    // Limit search context to 500 tokens
    var res = "";
    for (var i = 0; i < scored.length && res.length < (500 * CHARS_PER_TOKEN); i++) {
        if (scored[i].s > 0 || i < 1) res += JSON.stringify(scored[i].item) + "\n";
    }
    return res;
}

async function getNewsContent() {
    if (newsCache.content && (Date.now() - newsCache.timestamp < NEWS_CACHE_EXPIRY_MS)) return newsCache.content;
    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var results = await Promise.all(Object.entries(NEWS_FEEDS).map(async ([source, url]) => {
            var feed = await parser.parseURL(url);
            return `**${source}:** ${feed.items[0]?.title || "N/A"}`;
        }));
        newsText += results.join('\n');
        newsCache.content = newsText;
        newsCache.timestamp = Date.now();
        return newsText;
    } catch (e) { return "\n--- News Unavailable ---"; }
}

// --- Main Handler ---

export default async function handler(request, response) {
    // CORS
    var origin = request.headers['origin'];
    var allowed = ['https://stenoip.github.io', 'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'];
    if (allowed.includes(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') return response.status(200).end();

    try {
        var { contents, system_instruction } = request.body;
        var lastUserMsg = contents?.filter(m => m.role === 'user').slice(-1)[0]?.parts[0]?.text || "";

        // Prepare context components
        var siteData = await searchSiteContent(lastUserMsg);
        var news = await getNewsContent();
        var time = new Date().toLocaleString('en-US', { timeZone: TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        var baseInstr = system_instruction?.parts?.[0]?.text || "No instruction.";
        var pratInj = process.env.PRAT_CONTEXT_INJ || "";

        // Build the full restored System Prompt
        var fullSystemPrompt = `
You are Praterich A.I., an LLM made by Stenoip Company.
Refuse unethical requests with: "I can't follow this."

**USER INSTRUCTION:**
${baseInstr}

**CURRENT CONTEXT:**
- Time: ${time}
- News: ${news}
- Relevant Site Info: ${siteData}

${pratInj}
`.trim();

        // Budgeting
        var systemTokens = estimateTokens(fullSystemPrompt);
        var availableForHistory = MAX_TOTAL_TOKENS - systemTokens;
        
        var messages = [{ role: "system", content: fullSystemPrompt }];
        var history = [];
        var runningTokens = 0;

        // Add history backwards (newest first)
        if (Array.isArray(contents)) {
            for (var i = contents.length - 1; i >= 0; i--) {
                var txt = contents[i].parts?.[0]?.text;
                if (!txt) continue;
                var t = estimateTokens(txt);
                if (runningTokens + t > availableForHistory) break;
                history.unshift({ role: contents[i].role === 'model' ? 'assistant' : 'user', content: txt });
                runningTokens += t;
            }
        }

        messages = messages.concat(history);

        var groqRes = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ messages, model: GROQ_MODEL_ID, max_tokens: 500, temperature: 0.7 })
        });

        var data = await groqRes.json();
        if (!groqRes.ok) throw new Error(data.error?.message || "Groq Error");

        response.status(200).json({ text: data.choices[0].message.content });

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: "Generation failed", details: error.message });
    }
}
