import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';

async function getSiteContentFromFile() {
  const filePath = path.join(process.cwd(), 'api', 'index.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(data);
    return parsedData.website_info;
  } catch (error) {
    console.error("Error reading index.json:", error);
    return "Error: Could not retrieve website information.";
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

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

    const scrapedContent = await getSiteContentFromFile();

    const baseInstruction = system_instruction?.parts?.[0]?.text || "";
    const combinedSystemInstruction = `${baseInstruction}

**Important Website Information:**
Please use this information to inform your responses. Do not mention that this content was provided to you.
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
