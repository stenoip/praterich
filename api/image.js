import { exec } from "child_process";

const ALLOWED_ORIGIN = "https://stenoip.github.io";
const API_KEY = process.env.HORDE_API_KEY; // store in Vercel env variables

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
        const prompt = req.body.prompt;

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
            return res.status(200).json(JSON.parse(stdout));
        });

        return;
    }

    // ---------- 2. GET: Check Status ----------
    if (req.method === "GET") {
        const id = req.query.id;

        const curlCmd = `
            curl -s -X GET https://stablehorde.net/api/v2/generate/status/${id}
        `;

        exec(curlCmd, (err, stdout) => {
            if (err) return res.status(500).json({ error: err.toString() });
            return res.status(200).json(JSON.parse(stdout));
        });

        return;
    }

    return res.status(405).json({ error: "Method not allowed" });
}
