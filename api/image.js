// /api/praterich.js
const https = require('https');

// The main function that handles requests to your API
module.exports = async (req, res) => {
  // Handle only POST requests
  if (req.method === 'POST') {
    const customDescription = req.body.description;

    // Check if the description was provided
    if (!customDescription) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const options = {
      hostname: 'deep-image.ai',
      path: '/rest_api/process_result',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'a6e669a0-cb91-11f0-a947-e79092c8e12c'
      }
    };

    const data = JSON.stringify({
      "url": "https://deep-image.ai/api-example3.jpg",  // Example image URL
      "width": 1024,
      "height": 1024,
      "background": {
        "generate": {
          "description": customDescription,
          "adapter_type": "face",
          "model_type": "realistic",
          "avatar_generation_type": "regular"
        }
      }
    });

    const apiReq = https.request(options, (apiRes) => {
      let responseBody = '';
      apiRes.on('data', (chunk) => {
        responseBody += chunk;
      });

      apiRes.on('end', () => {
        res.status(200).json(JSON.parse(responseBody));
      });
    });

    apiReq.on('error', (e) => {
      console.error('Request error:', e);
      res.status(500).json({ error: 'Something went wrong with the image generation.' });
    });

    apiReq.write(data);
    apiReq.end();
  } else {
    // Only allow POST requests
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};
