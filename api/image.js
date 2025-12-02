import { exec } from "child_process";

const ALLOWED_ORIGIN = "https://stenoip.github.io";
const API_KEY = process.env.HORDE_API_KEY;      
const JOLDEN_TOKEN = process.env.JOLDEN_TOKEN;  // Moderator-set token

export default function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ---------- 1. POST: Submit Prompt ----------
  if (req.method === "POST") {
    const { prompt, joldenToken } = req.body;

    // Validate Jolden Token
    if (joldenToken !== JOLDEN_TOKEN) {
      return res.status(403).json({ error: "Invalid Jolden Token. Did it expire? To get a Token, you must complete Stenoip Company's daily challenge! " });
    }

    const curlCmd = `
      curl -s -X POST https://stablehorde.net/api/v2/generate/async \
      -H "Content-Type: application/json" \
      -H "apikey: ${API_KEY}" \
      -d '{
        "prompt": "${prompt.replace(/"/g, "\\\"")}",
        "params": {
          "width": 512,
          "height": 512,
          "steps": 20,
          "cfg_scale": 7,
          "sampler_name": "k_euler_a"
        }
      }'
    `;

    exec(curlCmd, (err, stdout) => {
      if (err) return res.status(500).json({ error: err.toString() });
      try {
        return res.status(200).json(JSON.parse(stdout));
      } catch {
        return res.status(500).json({ error: "Invalid JSON response" });
      }
    });
    return;
  }

  // ---------- 2. GET: Check Status ----------
  if (req.method === "GET") {
    const { id, joldenToken } = req.query;

    // Validate Jolden Token
    if (joldenToken !== JOLDEN_TOKEN) {
      return res.status(403).json({ error: "Invalid Jolden Token" });
    }

    const curlCmd = `
      curl -s -X GET https://stablehorde.net/api/v2/generate/status/${id} \
      -H "apikey: ${API_KEY}"
    `;

    exec(curlCmd, (err, stdout) => {
      if (err) return res.status(500).json({ error: err.toString() });
      try {
        return res.status(200).json(JSON.parse(stdout));
      } catch {
        return res.status(500).json({ error: "Invalid JSON response" });
      }
    });
    return;
  }

  return res.status(405).json({ error: "Method not allowed" });
}
