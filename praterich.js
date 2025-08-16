import { GoogleGenerativeLanguageServiceClient } from "@google-cloud/generativelanguage";

const client = new GoogleGenerativeLanguageServiceClient({
  auth: { apiKey: process.env.API_KEY },
});

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const { contents, system_instruction } = request.body;

    const result = await client.generateContent({
      model: "gemini-2.5-flash",
      contents,
      system_instruction,
      safetySettings: [],
      generationConfig: {},
    });

    response.status(200).json(result.result.response.candidates[0].content);
  } catch (error) {
    console.error("API call failed:", error);
    response.status(500).json({ error: "Failed to generate content." });
  }
}
