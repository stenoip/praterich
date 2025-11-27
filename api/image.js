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

      // Collect data chunks
      apiRes.on('data', (chunk) => {
        responseBody += chunk;
      });

      apiRes.on('end', () => {
        // Check the status code of the API response
        if (apiRes.statusCode === 200) {
          try {
            // Attempt to parse the response as JSON
            const jsonResponse = JSON.parse(responseBody);
            res.status(200).json(jsonResponse);  // Send the JSON response back to the client
          } catch (err) {
            console.error('Error parsing JSON:', err);
            res.status(500).json({ error: 'Error parsing JSON response from API.' });
          }
        } else {
          // If the status code isn't 200, log the body and return an error
          console.error('API returned an error:', responseBody);
          res.status(apiRes.statusCode).json({ error: 'Failed to generate image', details: responseBody });
        }
      });
    });

    apiReq.on('error', (e) => {
      console.error('Request error:', e);
      res.status(500).json({ error: 'Something went wrong with the image generation.' });
    });

    // Write data to the request body
    apiReq.write(data);
    apiReq.end();
  } else {
    // Only allow POST requests
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};
