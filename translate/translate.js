// ==========================
// CONFIG
// ==========================
const API_URL = "https://praterich.vercel.app/api/praterich";

const systemInstruction = `
You are Praterich. Translate text naturally and accurately.
Respond ONLY with the translation.
`;

// 20 LANGUAGES
const LANGUAGES = [
    "English",
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Russian",
    "Chinese",
    "Japanese",
    "Korean",
    "Arabic",
    "Turkish",
    "Dutch",
    "Polish",
    "Swedish",
    "Norwegian",
    "Finnish",
    "Greek",
    "Hindi",
    "Thai"
];

// Populate dropdowns
const fromLang = document.getElementById("fromLang");
const toLang = document.getElementById("toLang");

LANGUAGES.forEach(lang => {
    let opt1 = document.createElement("option");
    opt1.value = lang;
    opt1.textContent = lang;

    let opt2 = opt1.cloneNode(true);

    fromLang.appendChild(opt1);
    toLang.appendChild(opt2);
});

// Default
fromLang.value = "English";
toLang.value = "Spanish";

// ==========================
// SWAP LANGUAGES
// ==========================
document.getElementById("swapBtn").addEventListener("click", () => {
    let temp = fromLang.value;
    fromLang.value = toLang.value;
    toLang.value = temp;

    // Swap text fields too (Google Translate behavior)
    let t1 = document.getElementById("inputText").value;
    document.getElementById("inputText").value = document.getElementById("outputText").value;
    document.getElementById("outputText").value = t1;
});

// ==========================
// TRANSLATION
// ==========================
document.getElementById("translateBtn").addEventListener("click", async () => {
    const input = document.getElementById("inputText").value.trim();
    const source = fromLang.value;
    const target = toLang.value;
    const outputBox = document.getElementById("outputText");
    const loading = document.getElementById("loading");

    if (!input) {
        outputBox.value = "Enter text to translate.";
        return;
    }

    loading.textContent = "Translating...";
    outputBox.value = "";

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: `Translate from ${source} to ${target}: ${input}` }
                ]
            }
        ],
        system_instruction: {
            parts: [{ text: systemInstruction }]
        }
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        loading.textContent = "";

        if (!response.ok) {
            outputBox.value = "Translation failed.";
            return;
        }

        const data = await response.json();
        outputBox.value = data.text || "No translation received.";
    } catch (err) {
        loading.textContent = "";
        outputBox.value = "Network error.";
        console.error(err);
    }
});
