import { GoogleGenerativeLanguageServiceClient } from "@google-cloud/generativelanguage";
import { GoogleGenerativeLanguageServiceClient } from "@google-cloud/generativelanguage";

const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    // This is the correct way to get the API key from Vercel's environment variables
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }

    // Use the correct client library
    const genAI = new GoogleGenerativeAI(API_KEY);

    // Get the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Extract the contents and optional system instruction from the request body
    const { contents, system_instruction } = request.body;

    // Build the request payload
    const payload = {
      contents,
      safetySettings: [],
      generationConfig: {},
    };

    // Add system instruction if it's present in the request
    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    // Call the correct API method
    const result = await model.generateContent(payload);
    const apiResponse = await result.response;

    // Send the text content back as a JSON object
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content.", details: error.message });
  }
}
