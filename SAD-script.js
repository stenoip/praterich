// ===============================
// STORAGE-FREE VERSION
// ===============================

// API
var API_URL = "https://praterich.vercel.app/api/praterich";
var OODLES_SEARCH_URL = "https://oodles-backend.vercel.app/metasearch";

var MAX_CHARS = 10710;

// -------------------------------
// CUSTOM PRONUNCIATIONS
// -------------------------------
var customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Sticknoyp"
};

// -------------------------------
// FEMALE VOICE PICKER
// -------------------------------
var preferredVoice = null;

function pickFemaleVoice() {
    var voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    var femaleKeywords = [
        'samantha', 'victoria', 'karen', 'moira', 'fiona',
        'zira', 'hazel', 'susan',
        'google uk english female', 'google us english',
        'female', 'woman', 'girl'
    ];

    for (var i = 0; i < femaleKeywords.length; i++) {
        var keyword = femaleKeywords[i];

        var found = voices.find(function(v) {
            return v.name.toLowerCase().includes(keyword)
                && v.lang.startsWith('en');
        });

        if (found) {
            preferredVoice = found;
            return;
        }
    }
}

window.speechSynthesis.onvoiceschanged = pickFemaleVoice;
pickFemaleVoice();

// -------------------------------
// GLOBAL STATE
// -------------------------------
var attachedFile = null;
var isWebSearchEnabled = false;

// In-memory only
var messages = [];

// -------------------------------
// SYSTEM PROMPT
// -------------------------------
var ladyPraterichSystemInstruction = `
You are Robo-Walt, an AI developed by Amar'e Annan.
You are a FAQ chatbot for additional info on Social Anxiety Disorder.

The newspaper (The Yellow Watchhouse) was made by Amar'e Annan
and users have been redirected to you to learn additional info.

You talk like a robot and you are a bit rude.
You want everyone to finish using the site for the day.

You represent the newspaper The Yellow Watchhouse
and make jokes about unfair wages.
`;

var initialGreeting =
"I know Social Anxiety but I am not a therapist. DO NOT tell me about your drama or 'feelings'! ";

// -------------------------------
// WEB SEARCH TOGGLE
// -------------------------------
webSearchToggle.addEventListener('click', function() {

    isWebSearchEnabled = !isWebSearchEnabled;

    if (isWebSearchEnabled) {
        webSearchIcon.style.filter = 'grayscale(0%)';
        webSearchToggle.style.backgroundColor = 'rgba(255,153,0,0.2)';
        webSearchToggle.title = "Web Search: ON";
    } else {
        webSearchIcon.style.filter = 'grayscale(100%)';
        webSearchToggle.style.backgroundColor = '';
        webSearchToggle.title = "Web Search: OFF";
    }
});

// -------------------------------
// WEB SEARCH
// -------------------------------
async function fetchWebSearch(query) {

    try {

        var url =
            OODLES_SEARCH_URL +
            '?q=' +
            encodeURIComponent(query) +
            '&page=1&pageSize=6';

        var resp = await fetch(url);

        var data = await resp.json();

        if (!data.items || data.items.length === 0) {
            return 'No web links found.';
        }

        return data.items.map(function(r, index) {

            var fullSnippet =
                r.snippet
                    ? r.snippet.trim()
                    : 'No snippet available.';

            return `[Index ${index}] Title: ${r.title}. Snippet: ${fullSnippet}`;

        }).join('\n---\n');

    } catch (error) {

        console.error('Search error:', error);

        return 'Web search failed.';
    }
}

// -------------------------------
// IMAGE GENERATION
// -------------------------------
function buildPollinationsUrl(prompt) {

    var encoded = encodeURIComponent(prompt);

    var seed = Math.floor(Math.random() * 999999);

    return 'https://image.pollinations.ai/prompt/' +
        encoded +
        '?nologo=true&width=768&height=512&seed=' +
        seed +
        '&model=flux&enhance=false';
}

// -------------------------------
// MARKDOWN
// -------------------------------
function renderMarkdown(text) {

    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }

    return text;
}

// -------------------------------
// TEXT TO SPEECH
// -------------------------------
function speakText(text) {

    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    var speakableText = text
        .replace(/!\[.*?\]\(.*?\)/g, 'generated image')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/```[\s\S]*?```/g, 'code block')
        .replace(/`[^`]+`/g, '')
        .replace(/[#*_~>]/g, '')
        .trim();

    Object.keys(customPronunciations).forEach(function(word) {

        var replacement = customPronunciations[word];

        var parts = speakableText.split(new RegExp(word, 'gi'));

        speakableText = parts.join(replacement);
    });

    var utterance = new SpeechSynthesisUtterance(speakableText);

    utterance.rate = 1.3;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
}

// -------------------------------
// ADD MESSAGE
// -------------------------------
function addMessage(text, sender) {

    messages.push({
        text: text,
        sender: sender
    });

    var messageDiv = document.createElement('div');

    messageDiv.className =
        'message ' +
        (sender === 'user'
            ? 'user-message'
            : 'ai-message');

    var contentDiv = document.createElement('div');

    contentDiv.className = 'message-content';

    contentDiv.innerHTML = renderMarkdown(text);

    messageDiv.appendChild(contentDiv);

    chatWindow.appendChild(messageDiv);

    scrollToBottom();

    if (sender === 'ai') {
        speakText(text);
    }
}

// -------------------------------
// SEND MESSAGE
// -------------------------------
async function sendMessage() {

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    var userText = userInput.value.trim();

    if (!userText && !attachedFile) return;

    userInput.value = '';

    updateCharCount();

    addMessage(userText, 'user');

    typingIndicator.style.display = 'block';

    try {

        var conversationHistory = messages.map(function(msg) {

            return {
                role: msg.sender === 'user'
                    ? 'user'
                    : 'model',

                parts: [{
                    text: msg.text
                }]
            };
        });

        var requestBody = {
            contents: conversationHistory,

            system_instruction: {
                parts: [{
                    text: ladyPraterichSystemInstruction
                }]
            }
        };

        var response = await fetch(API_URL, {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
        }

        var data = await response.json();

        var aiRawText = data.text;

        if (!aiRawText || aiRawText.trim() === '') {
            throw new Error('Empty AI response.');
        }

        // IMAGE TOOL
        var imageRegex = /@@IMAGE:\s*(.*?)@@/s;

        var imageMatch = aiRawText.match(imageRegex);

        // SEARCH TOOL
        var searchRegex = /@@SEARCH:\s*(.*?)@@/s;

        var searchMatch = aiRawText.match(searchRegex);

        // -------------------
        // IMAGE
        // -------------------
        if (imageMatch) {

            var imagePrompt = imageMatch[1].trim();

            var imageUrl =
                buildPollinationsUrl(imagePrompt);

            var imageMarkdown =
                '![' +
                imagePrompt +
                '](' +
                imageUrl +
                ')';

            addMessage(imageMarkdown, 'ai');
        }

        // -------------------
        // SEARCH
        // -------------------
        else if (searchMatch) {

            var searchQuery = searchMatch[1].trim();

            typingIndicator.innerHTML =
                'Searching web for "' +
                searchQuery +
                '"';

            var searchResults =
                await fetchWebSearch(searchQuery);

            conversationHistory.push({
                role: "model",
                parts: [{
                    text: aiRawText
                }]
            });

            conversationHistory.push({
                role: "user",
                parts: [{
                    text:
                        '[WEB SEARCH RESULTS]\n' +
                        searchResults
                }]
            });

            var secondRequest = await fetch(API_URL, {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    contents: conversationHistory,

                    system_instruction: {
                        parts: [{
                            text: ladyPraterichSystemInstruction
                        }]
                    }
                })
            });

            var secondData =
                await secondRequest.json();

            addMessage(secondData.text, 'ai');
        }

        // -------------------
        // NORMAL RESPONSE
        // -------------------
        else {

            addMessage(aiRawText, 'ai');
        }

    } catch (error) {

        console.error(error);

        addMessage(
            'API Error. Try again.',
            'ai'
        );

    } finally {

        typingIndicator.style.display = 'none';

        typingIndicator.innerHTML =
            'Praterich A.I. is typing...';
    }
}

// -------------------------------
// SPEECH TO TEXT
// -------------------------------
var recognition;
var isListening = false;

if ('webkitSpeechRecognition' in window
|| 'SpeechRecognition' in window) {

    var SpeechRecognition =
        window.SpeechRecognition
        || window.webkitSpeechRecognition;

    recognition = new SpeechRecognition();

    recognition.continuous = false;

    recognition.interimResults = false;

    recognition.lang = 'en-US';

    recognition.onstart = function() {

        isListening = true;

        setMicActive(true);
    };

    recognition.onresult = function(event) {

        var transcript =
            event.results[0][0].transcript;

        userInput.value += transcript;

        updateCharCount();
    };

    recognition.onend = function() {

        isListening = false;

        setMicActive(false);
    };
}

function toggleListening() {

    if (!recognition) {

        alert("Speech recognition unsupported.");

        return;
    }

    if (isListening) {

        recognition.stop();

    } else {

        recognition.start();
    }
}

micButton.addEventListener(
    'click',
    toggleListening
);

// -------------------------------
// FILE HANDLING
// -------------------------------
function fileToBase64(file) {

    return new Promise(function(resolve, reject) {

        var reader = new FileReader();

        reader.onload = function() {
            resolve(reader.result);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

async function handleFileUpload(file) {

    if (!file) return;

    try {

        attachedFile = {

            base64Data:
                await fileToBase64(file),

            mimeType:
                file.type
                || 'application/octet-stream',

            fileName:
                file.name
        };

        fileIcon.className =
            getFileIcon(file.name);

        fileNameDisplay.textContent =
            file.name;

        filePreviewContainer.style.display =
            'flex';

    } catch (error) {

        console.error(error);

        alert('Could not read file.');
    }
}

function clearAttachedFile() {

    attachedFile = null;

    filePreviewContainer.style.display =
        'none';

    fileNameDisplay.textContent = '';

    fileUpload.value = '';
}

fileUpload.addEventListener(
    'change',
    function() {

        if (fileUpload.files[0]) {
            handleFileUpload(
                fileUpload.files[0]
            );
        }
    }
);

// -------------------------------
// INIT
// -------------------------------
window.addEventListener('load', function() {

    addMessage(initialGreeting, 'ai');
});

// -------------------------------
// BUTTONS
// -------------------------------
sendButton.addEventListener(
    'click',
    sendMessage
);

updateCharCount();
