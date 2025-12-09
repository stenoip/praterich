// ==========================
// CONFIG
// ==========================
const API_URL = "https://praterich.vercel.app/api/praterich";

const systemInstruction = `
You are Praterich. Translate text naturally and accurately.
Respond ONLY with the translation.
`;

let mergedLanguageData = null;

// Languages available
const LANGUAGES = [
    "English", "Spanish", "French", "German", "Italian",
    "Portuguese", "Russian", "Chinese", "Japanese", "Korean",
    "Arabic", "Turkish", "Dutch", "Polish", "Swedish",
    "Norwegian", "Finnish", "Greek", "Hindi", "Thai", "Ga"
];

// ==========================
// Populate dropdowns
// ==========================
function populateDropdown(id) {
    const element = document.getElementById(id);
    LANGUAGES.forEach(lang => {
        let opt = document.createElement("option");
        opt.value = lang;
        opt.textContent = lang;
        element.appendChild(opt);
    });
}

// Function calls moved to the bottom initialization block for consistency
// populateDropdown("fromLang");
// populateDropdown("toLang");
// populateDropdown("mergeLang1");
// populateDropdown("mergeLang2");

// fromLang.value = "English";
// toLang.value = "Spanish";

// ==========================
// SWAP LANGUAGES
// ==========================
document.getElementById("swapBtn").addEventListener("click", () => {
    let temp = fromLang.value;
    fromLang.value = toLang.value;
    toLang.value = temp;

    let t1 = inputText.value;
    inputText.value = outputText.value;
    outputText.value = t1;
});

// ==========================
// Standard Translation
// ==========================
async function performStandardTranslation(input, source, target) {
    if (!input) {
        outputText.value = "Enter text to translate.";
        return;
    }

    loading.textContent = "Translating...";
    outputText.value = "";

    const body = {
        contents: [
            { role: "user", parts: [{ text: `Translate from ${source} to ${target}: ${input}` }] }
        ],
        system_instruction: { parts: [{ text: systemInstruction }] }
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        loading.textContent = "";

        if (!response.ok) {
            outputText.value = "Translation failed.";
            return;
        }

        const data = await response.json();
        outputText.value = data.text || "No translation.";
    } catch {
        loading.textContent = "";
        outputText.value = "Network error.";
    }
}

// Event listener uses the new standalone function
translateBtn.addEventListener("click", () => {
    performStandardTranslation(inputText.value.trim(), fromLang.value, toLang.value);
});


// ==========================
// LANGUAGE LEARNING CHAT
// ==========================
learnBtn.addEventListener("click", async () => {
    const question = learnInput.value.trim();
    const selectedLang = toLang.value;

    if (!question) {
        learnOutput.value = "Please enter a question.";
        return;
    }

    learnLoading.textContent = "Thinking...";
    learnOutput.value = "";

    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: `Explain the following about ${selectedLang}: ${question}` }
                ]
            }
        ],
        system_instruction: {
            parts: [
                {
                    text: `
You are Praterich, a language tutor.
Explain grammar, vocabulary, pronunciation, cultural context, and examples.
Avoid translation unless asked directly.
`
                }
            ]
        }
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        learnLoading.textContent = "";
        const data = await response.json();
        learnOutput.value = data.text || "No response.";
    } catch {
        learnLoading.textContent = "";
        learnOutput.value = "Network error.";
    }
});

// ==========================
// MERGE TWO LANGUAGES
// ==========================
mergeBtn.addEventListener("click", async () => {
    const A = document.getElementById("mergeLang1").value;
    const B = document.getElementById("mergeLang2").value;

    mergeLoading.textContent = "Merging languages...";
    mergedPreview.value = "";

    const body = {
        system_instruction: {
            parts: [
                {
                    text: `
You are Praterich.
When creating merged languages, you MUST output ONLY valid JSON.
No markdown. No comments. No backticks. No explanations.
Respond ONLY with strict valid JSON.
`
                }
            ]
        },
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `
Create a merged language using ${A} and ${B}.
Output ONLY valid JSON like this:

{
  "name": "<merged language name>",
  "description": "...",
  "alphabet": [...],
  "grammar_rules": [...],
  "word_creation_rules": [...],
  "sample_vocabulary": [
    { "word": "", "meaning": "" }
  ],
  "translation_logic": "Explain how translation works."
}

No backticks. No extra text.
`
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        mergeLoading.textContent = "";

        // clean possible code fences
        let text = data.text.trim();
        text = text.replace(/```json|```/g, "").trim();

        try {
            mergedLanguageData = JSON.parse(text);
            mergedPreview.value = JSON.stringify(mergedLanguageData, null, 2);
        } catch {
            mergedPreview.value = "Invalid JSON returned. Try again.";
        }
    } catch {
        mergeLoading.textContent = "";
        mergedPreview.value = "Network error.";
    }
});

// ==========================
// DOWNLOAD MERGED LANGUAGE JSON
// ==========================
downloadMerged.addEventListener("click", () => {
    if (!mergedLanguageData) {
        alert("No merged language to download!");
        return;
    }

    const blob = new Blob(
        [JSON.stringify(mergedLanguageData, null, 2)],
        { type: "application/json" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${mergedLanguageData.name || "merged_language"}.json`;
    a.click();
});

// ==========================
// UPLOAD MERGED LANGUAGE JSON
// ==========================
uploadMerged.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    try {
        mergedLanguageData = JSON.parse(text);
        mergedPreview.value = JSON.stringify(mergedLanguageData, null, 2);
    } catch {
        alert("Invalid JSON file.");
    }
});

// ==========================
// MERGED LANGUAGE TRANSLATOR
// ==========================
mergeTranslateBtn.addEventListener("click", async () => {
    const input = mergeInput.value.trim();

    if (!mergedLanguageData) {
        mergeOutput.value = "No merged language loaded!";
        return;
    }

    mergeTranslateLoading.textContent = "Translating...";
    mergeOutput.value = "";

    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `
Using this merged language definition:

${JSON.stringify(mergedLanguageData)}

Translate the following text using the merged language rules:
${input}
`
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        mergeTranslateLoading.textContent = "";
        const data = await response.json();
        mergeOutput.value = data.text || "No translation.";
    } catch {
        mergeTranslateLoading.textContent = "";
        mergeOutput.value = "Network error.";
    }
});

// ==========================
// AUTO-TRANSLATE FROM URL QUERY (NEW)
// ==========================
function autoTranslateQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    
    if (query) {
        // 1. Decode and clean the query
        const textToTranslate = decodeURIComponent(query).trim();

        // 2. Pre-fill the input box
        inputText.value = textToTranslate;
        
        // 3. Immediately trigger the translation
        // Use default languages (English to Spanish) since the query doesn't specify
        performStandardTranslation(textToTranslate, fromLang.value, toLang.value);
    }
}

// ==========================
// INITIALIZATION
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    // Populate dropdowns
    populateDropdown("fromLang");
    populateDropdown("toLang");
    populateDropdown("mergeLang1");
    populateDropdown("mergeLang2");

    // Set defaults
    fromLang.value = "English";
    toLang.value = "Spanish";

    // Check URL for query and auto-translate if found
    autoTranslateQuery();
});
