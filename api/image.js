var https = require('https');

// The main function that handles requests to your API
module.exports = async function (req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Check origin (CORS restriction)
  var origin = req.headers.origin || req.headers.referer;
  if (!origin || origin.indexOf('stenoip.github.io') === -1) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Forbidden: Invalid origin' });
  }

  var customDescription = req.body && req.body.description;
  if (!customDescription) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({ error: 'Description is required.' });
  }

  var options = {
    hostname: 'deep-image.ai',
    path: '/rest_api/process_result',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'a6e669a0-cb91-11f0-a947-e79092c8e12c'
    }
  };

  var data = JSON.stringify({
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

  var apiReq = https.request(options, function (apiRes) {
    var responseBody = '';

    apiRes.on('data', function (chunk) {
      responseBody += chunk;
    });

    apiRes.on('end', function () {
      res.setHeader('Content-Type', 'application/json');
      if (apiRes.statusCode === 200) {
        try {
          var jsonResponse = JSON.parse(responseBody);
          res.status(200).json(jsonResponse);
        } catch (err) {
          console.error('Error parsing JSON:', err);
          res.status(500).json({ error: 'Error parsing JSON response from API.' });
        }
      } else {
        console.error('API returned an error:', responseBody);
        res.status(apiRes.statusCode).json({ error: 'Failed to generate image', details: responseBody });
      }
    });
  });

  apiReq.on('error', function (e) {
    console.error('Request error:', e);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: 'Something went wrong with the image generation.' });
  });

  apiReq.write(data);
  apiReq.end();
};
