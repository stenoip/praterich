import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(request, response) {
  // Set CORS headers to allow requests from stenoip.github.io
  response.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');  // Replace with your actual domain
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Credentials', 'true');  // Allow cookies if needed

  // Handle preflight requests (OPTIONS requests)
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Verify the origin is from a valid source (security measure)
  const origin = request.headers['origin'];
  if (origin !== 'https://stenoip.github.io') {
    console.error('Forbidden: Unauthorized origin', origin);  // Log the origin if it doesn't match
    return response.status(403).json({ error: 'Forbidden: Unauthorized origin.' });
  }

  // Ensure the request method is POST
  if (request.method !== 'POST') {
    console.error('Invalid request method:', request.method);  // Log if the request method isn't POST
    return response.status(405).send('Method Not Allowed');
  }

  try {
    const API_KEY = process.env.API_KEY;  // Make sure to set your API key in your environment variables
    if (!API_KEY) {
      throw new Error('API_KEY environment variable is not set.');
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const { contents, system_instruction } = request.body;  // Extract relevant fields from the request body

    if (!contents) {
      throw new Error('Missing "contents" field in request body.');
    }

    // Log the received contents (for debugging purposes)
    console.log('Received contents:', contents);

    // Build the payload to pass to the model
    const payload = {
      contents,
      safetySettings: [],
      generationConfig: {},
    };

    if (system_instruction) {
      payload.systemInstruction = system_instruction;
    }

    // Fetch more information from your external files and sites
    const moreInfo = await fetchFileContent('more_info.txt');
    const personalityInfo = await fetchFileContent('personality.txt');
    const externalContent = await fetchExternalContent();

    // Combine content from external files and sources
    payload.contents += `\n\nMore Info:\n${moreInfo}\n\nPersonality Info:\n${personalityInfo}\n\nExternal Content:\n${externalContent}`;

    // Log the full payload before sending to the AI model
    console.log('Generated Payload:', payload);

    // Call the generative model to get content based on the provided inputs
    const result = await model.generateContent(payload);
    const apiResponse = result.response;

    // Send back the generated content as a response
    response.status(200).json({ text: apiResponse.text() });
  } catch (error) {
    console.error('Error during API call:', error.message);  // Log the error message for debugging
    response.status(500).json({ error: 'Failed to generate content.', details: error.message });
  }
}

// Helper function to fetch content from an external file
async function fetchFileContent(fileName) {
  try {
    const res = await fetch(`https://stenoip.github.io/praterich/${fileName}`);  // Replace with your file URL
    if (!res.ok) {
      throw new Error(`Failed to fetch ${fileName}`);
    }
    return await res.text();
  } catch (err) {
    console.error(`Error fetching ${fileName}:`, err.message);
    throw new Error(`Error fetching ${fileName}`);
  }
}

// Helper function to fetch external content (e.g., crawling WikiHow)
async function fetchExternalContent() {
  try {
    const response = await fetch('https://www.wikihow.com/Some-Article');  // Replace with the actual article URL
    const html = await response.text();

    // Example: Extract relevant content from the page (this would require a proper parser)
    // This is just an example - you can use libraries like Cheerio for server-side parsing if needed
    const content = html.match(/<div class="step">(.*?)<\/div>/);  // Simplified extraction (you should improve this part)
    return content ? content[1] : 'No external content found.';
  } catch (err) {
    console.error('Error fetching external content:', err);
    return 'Failed to fetch external content.';
  }
}
