/* Copyright Stenoip Company. All rights reserved.

This file acts as a Vercel serverless function (API endpoint) that proxies requests to the Hugging Face Inference API via the OpenAI-compatible Router endpoint.
It injects custom context, including news headlines and site content, to ground the model's responses.
*/

// --- Hugging Face-Specific Imports ---
var fs = require('fs/promises');
var path = require('path');
var Parser = require('rss-parser');
// NOTE: We do not import the 'openai' SDK here, we use native 'fetch'
// to send an OpenAI-compatible request payload to the HF Router endpoint.

// --- Configuration ---
var parser = new Parser();
var NEWS_FEEDS = {
    BBC: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    CNN: 'http://rss.cnn.com/rss/cnn_topstories.rss'
};
var TIMEZONE = 'America/New_York';
var MAX_RETRIES = 3; // Maximum retry attempts for the API call
var RETRY_DELAY = 5000; // Delay between retries in milliseconds (5 seconds)


var HF_API_TOKEN = process.env.HF_API_TOKEN || process.env.HF_TOKEN; // Use HF_TOKEN as fallback for Router
var HF_MODEL_NAME = "meta-llama/Llama-2-7b-chat-hf"; 

// Use the Hugging Face Router endpoint for OpenAI compatibility
var HF_INFERENCE_API_URL = "https://router.huggingface.co/v1/chat/completions";

// --- Helper Functions (getSiteContentFromFile, getNewsContent remain unchanged) ---

async function getSiteContentFromFile() {
    // Path to the index.json file
    var filePath = path.join(process.cwd(), 'api', 'index.json');
    try {
        // Read the file as raw text (no JSON parsing)
        var data = await fs.readFile(filePath, 'utf8');
        return data; // Return raw text content from index.json
    } catch (error) {
        // Log the error and return a fallback message
        console.error("Error reading index.json:", error.message);
        return "Error: Could not retrieve content from index.json.";
    }
}

/**
 * Fetches and aggregates the top headlines from specified RSS feeds.
 * @returns {Promise<string>} A formatted string of news headlines or an error message.
 */
async function getNewsContent() {
    var newsText = "\n--- Global News Headlines ---\n";
    try {
        var allNewsPromises = Object.entries(NEWS_FEEDS).map(async function ([source, url]) {
            var feed = await parser.parseURL(url);
            var sourceNews = `\n**${source} Top Stories (Latest):**\n`;
            
            // Limit to the top 3 items per feed for brevity and token efficiency
            feed.items.slice(0, 3).forEach(function (item, index) {
                // Remove Markdown characters from titles to prevent instruction injection issues
                var safeTitle = item.title.replace(/[\*\_\[\]]/g, ''); 
                sourceNews += `  ${index + 1}. ${safeTitle}\n`;
            });
            return sourceNews;
        });

        // Wait for all news fetches to complete
        var newsResults = await Promise.all(allNewsPromises);
        newsText += newsResults.join('');
        return newsText;

    } catch (error) {
        console.error("Error fetching or parsing RSS feeds:", error.message);
        return "\n--- Global News Headlines ---\n[Error: Could not retrieve latest news due to network or parsing issue.]\n";
    }
}

/**
 * Constructs the combined system instruction for grounding the model.
 * @param {string} baseInstruction - The user-provided system instruction.
 * @param {string} trimmedContent - Content from index.json.
 * @param {string} newsContent - Aggregated news headlines.
 * @param {string} currentTime - Current time string.
 * @param {string} PRAT_CONTEXT_INJ - Context injection from environment variable.
 * @returns {string} The complete system-level prompt.
 */
function buildSystemInstruction(baseInstruction, trimmedContent, newsContent, currentTime, PRAT_CONTEXT_INJ) {
    var fullInstruction = `You are Praterich A.I., an LLM made by Stenoip Company.

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

Based on the context and instructions above, please provide a helpful and professional response.`;
    
    return fullInstruction;
}


/**
 * Attempts to fetch content from the Hugging Face Inference API with retry logic
 * using the OpenAI-compatible chat completions format.
 * @param {Array<Object>} messages - The array of messages to send to the model.
 * @param {number} retries - The number of retries remaining.
 * @returns {Promise<string>} The generated response text.
 */
async function fetchFromModelWithRetry(messages, retries = MAX_RETRIES) {
    if (!HF_API_TOKEN) {
        throw new Error("HF_API_TOKEN or HF_TOKEN environment variable is not set.");
    }
    
    // The HF Router doesn't typically return 503 like the old Inference API,
    // but the retry logic remains useful for network or transient errors.

    try {
        var response = await fetch(HF_INFERENCE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // HF Router expects the token as the Authorization header
                'Authorization': `Bearer ${HF_API_TOKEN}` 
            },
            body: JSON.stringify({
                model: HF_MODEL_NAME,
                messages: messages, // Send the array of messages
                temperature: 0.7,
                max_tokens: 500, // max_new_tokens for HF is max_tokens for OpenAI standard
                stream: false,
                // Add any other HF Router/OpenAI compatible parameters here
            })
        });

        if (!response.ok) {
            // Handle HTTP errors
            var errorBody = await response.json().catch(function () { return { error: 'Unknown API error' }; });
            throw new Error(`Hugging Face API Error ${response.status}: ${JSON.stringify(errorBody)}`);
        }
        
        // The API returns an OpenAI-compatible ChatCompletion object.
        var result = await response.json();
        
        // Extract the generated text from the OpenAI-compatible response structure
        if (result && result.choices && result.choices.length > 0 && result.choices[0].message) {
            return result.choices[0].message.content.trim();
        } else {
            throw new Error("Hugging Face Router API returned an unexpected response format.");
        }

    } catch (error) {
        console.error("Error fetching from model:", error.message);

        // Check for transient errors and retry
        if (retries > 0) {
            console.log(`Transient error encountered. Retrying in ${RETRY_DELAY / 1000} seconds...`);
            await new Promise(function(resolve) { setTimeout(resolve, RETRY_DELAY); }); // Wait before retrying
            return fetchFromModelWithRetry(messages, retries - 1); // Retry the request
        }

        // If all retries fail, re-throw the final error
        throw error;  
    }
}


export default async function handler(request, response) {
    // These are the only allowed origins.
    var allowedOrigins = ['https://stenoip.github.io', 'https://www.khanacademy.org/computer-programming/praterich_ai/5593365421342720'];
    var origin = request.headers['origin'];

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
        if (!HF_API_TOKEN) {
            throw new Error("HF_API_TOKEN or HF_TOKEN environment variable is not set.");
        }

        var PRAT_CONTEXT_INJ = process.env.PRAT_CONTEXT_INJ || "Praterich Context Injection not set.";
        // -----------------------------------------------------------------

        // In the Hugging Face setup, we don't initialize a client object here.
        // The request body contains 'contents' (user message) and 'system_instruction'
        var requestBody = request.body || {};
        var contents = requestBody.contents;
        var system_instruction = requestBody.system_instruction;

        // --- Fetch and Prepare Context ---
        var scrapedContent = await getSiteContentFromFile(); // Read index.json as plain text
        var newsContent = await getNewsContent();

        // Get current time information (for time knowledge grounding)
        var currentTime = new Date().toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        var trimmedContent = scrapedContent;

        // Extract user's instruction from the front-end payload
        var userMessage = contents && contents.at(-1) && contents.at(-1).parts && contents.at(-1).parts[0] ? contents.at(-1).parts[0].text : "Hello.";
        
        // Extract user-provided system instruction
        var baseInstruction = system_instruction && system_instruction.parts && system_instruction.parts[0] ? system_instruction.parts[0].text : "No additional instruction provided.";


        // --- Build the Unified System Instruction ---
        var unifiedSystemInstruction = buildSystemInstruction(baseInstruction, trimmedContent, newsContent, currentTime, PRAT_CONTEXT_INJ);


        // --- Construct the OpenAI-Compatible Messages Array ---
        // The messages array is the new format required by the Hugging Face Router /chat/completions endpoint.
        var messages = [
            {
                role: "system",
                content: unifiedSystemInstruction
            },
            {
                role: "user",
                content: userMessage
            }
        ];

        // The fetch call now uses the messages array directly
        var apiResponseText = await fetchFromModelWithRetry(messages);
        
        response.status(200).json({ text: apiResponseText });

    } catch (error) {
        console.error("API call failed:", error);

        response.status(500).json({
            error: "Failed to generate content.",
            details: error.message || "An unknown error occurred during content generation."
        });
    }
}
