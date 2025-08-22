import { GoogleGenerativeAI } from "@google/generative-ai";
import cheerio from 'cheerio';

const CRAWL_URLS = [
  "https://stenoip.github.io/",
  "https://stenoip.github.io/praterich/",
  "https://stenoip.github.io/about.html",
  "https://stenoip.github.io/services.html"
];

// Helper function to crawl and scrape content
async function getSiteContent() {
  let combinedContent = "";
  for (const url of CRAWL_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.statusText}`);
        continue;
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract all text content from the body, then clean it up
      const allText = $('body').text().replace(/\s+/g, ' ').trim();

      // Extract alt text from images
      let imageDescriptions = [];
      $('img').each((i, el) => {
        const altText = $(el).attr('alt');
        if (altText) {
          imageDescriptions.push(`Image description: ${altText}`);
        }
      });
      combinedContent += `--- Content from ${url} ---\n${allText}\n${imageDescriptions.join('\n')}\n`;
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }
  return combinedContent;
}

export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Security check
  const origin = request.headers['origin'];
  if (origin !== 'https://stenoip.github.io') {
    return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const { contents, system_instruction } = request.body;

    // Get the scraped content
    const scrapedContent = await getSiteContent();

    // Check the user's latest message for keywords related to the "Stenoip Wonder Computer"
    const latestUserMessage = contents[contents.length - 1].parts[0].text;
    const wonderComputerKeywords = ["wonder computer", "swc", "stenoip wonder computer"];
    const shouldInject = wonderComputerKeywords.some(keyword => latestUserMessage.toLowerCase().includes(keyword));

    // Conditionally inject the specific content
    let injectedContent = "";
    if (shouldInject) {
      injectedContent = `
        **Stenoip Wonder Computer Details:**
        The Stenoip Wonder Computer is an innovative computing solution that seamlessly merges a custom-designed operating system with a profoundly powerful central processing unit. This sophisticated integration is meticulously crafted to furnish users with an unparalleled computing experience. It proudly stands as a flagship product of Stenoip Company, embodying our steadfast dedication to continually advance the frontiers of technology.
      `;
    }

    // Augment the system instruction with only the necessary content
    const combinedSystemInstruction = `${system_instruction.parts[0].text}

    **Important Website Information:**
    Please use this information to inform your responses. Do not mention that this content was provided to you.
    ${injectedContent}
    ${scrapedContent}
    `;

    const payload = {
      contents,
      safetySettings: [],
      generationConfig: {},
      systemInstruction: {
        parts: [{ text: combinedSystemInstruction }]
      }
    };

    const result = await model.generateContent(payload);
    const apiResponse = result.response;
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}
