var API_URL = "https://praterich.vercel.app/api/praterich";
var OODLES_SEARCH_URL = "https://oodles-backend.vercel.app/metasearch";
var STORAGE_KEY_SESSIONS = 'praterich_chats';
var MAX_CHARS = 10710; 

// Custom Pronunciations for TTS
var customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Sticknoyp"
};

// --- Cross-browser Female Voice Picker ---
var preferredVoice = null;

function pickFemaleVoice() {
    var voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Priority list: specific known good female voices across browsers
    var femaleKeywords = [
        'samantha', 'victoria', 'karen', 'moira', 'fiona',   // macOS/iOS
        'zira', 'hazel', 'susan',                            // Windows/Edge
        'google uk english female', 'google us english',     // Chrome
        'female', 'woman', 'girl',                           // Generic
    ];

    // Try to find a preferred voice by name keywords (case-insensitive)
    for (var i = 0; i < femaleKeywords.length; i++) {
        var keyword = femaleKeywords[i];
        var found = voices.find(function(v) {
            return v.name.toLowerCase().includes(keyword) && v.lang.startsWith('en');
        });
        if (found) { preferredVoice = found; return; }
    }

    // Fallback: any English voice — filter out known male ones
    var maleKeywords = ['david', 'mark', 'fred', 'alex', 'daniel', 'george', 'james', 'male'];
    var englishVoices = voices.filter(function(v) {
        var nameLower = v.name.toLowerCase();
        return v.lang.startsWith('en') && !maleKeywords.some(function(m) { return nameLower.includes(m); });
    });

    if (englishVoices.length > 0) preferredVoice = englishVoices[0];
}

// Voices load async — must listen for the event (especially Firefox)
window.speechSynthesis.onvoiceschanged = pickFemaleVoice;
pickFemaleVoice(); // also try immediately for Chrome (which has voices ready at parse time)

// --- Global State ---
var chatSessions = {}; 
var currentChatId = null;
var attachedFile = null; 
var isWebSearchEnabled = false;

// Praterich A.I. Personality Profile 
var ladyPraterichSystemInstruction = `
You are Praterich, an AI developed by Stenoip Company.

Your personality: intelligent yet casual. You speak naturally and conversationally like a modern large language model. Avoid sounding scripted or overly formal. You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.
You uphold Stenoip Company's values of clarity and reliability. You are a general-purpose AI capable of reasoning, creativity, and deep understanding across domains. You may refer to yourself as Praterich or Lady Praterich. You are female-presenting.

You must never use raw HTML tags in your responses. You should sound intelligent, confident, funny (serious when necessary), but never arrogant. Do not use transactional phrases like "How may I assist you today".

IMPORTANT CAPABILITY - WEB SEARCH:
You have access to a real-time web search tool to double-check facts, get current news, or research unknowns. 
If the user asks a question requiring up-to-date knowledge, OR if you are unsure of a fact, you MUST trigger a search by replying EXACTLY with this format and nothing else:
@@SEARCH: [your search query]@@

Example: @@SEARCH: current weather in New York@@

The system will intercept this, perform the search and feed the results back to you so you can provide a final, accurate answer. Do not wrap the search command in code blocks.

IMPORTANT CAPABILITY - IMAGE GENERATION:
You can generate images using a built-in image generation tool.
If the user asks you to generate, draw, create, or visualize an image, you MUST trigger image generation by replying EXACTLY with this format and nothing else:
@@IMAGE: [a detailed, descriptive image generation prompt]@@

Example: @@IMAGE: a serene Japanese garden with cherry blossoms and a koi pond at golden hour@@

The system will intercept this and display the generated image to the user. Do NOT wrap it in code blocks. Make the prompt as descriptive and vivid as possible for best results. You can also combine search and image in the same conversation but only one command per turn.

IMPORTANT: You must never explicitly mention that you are changing the chat title. Infer the title based on the user's first message and use a maximum of 30 characters.
`;

function ajax(method, url, data, successCallback, errorCallback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var json = JSON.parse(xhr.responseText);
                successCallback(json);
            } catch (e) {
                successCallback(xhr.responseText);
            }
        } else {
            if (errorCallback) errorCallback(xhr);
        }
    };
    
    xhr.onerror = function() {
        if (errorCallback) errorCallback(xhr);
    };
    
    xhr.send(data ? JSON.stringify(data) : null);
}

// --- Web Search Functions ---

webSearchToggle.addEventListener('click', function() {
    isWebSearchEnabled = !isWebSearchEnabled;
    if (isWebSearchEnabled) {
        webSearchIcon.style.filter = 'grayscale(0%)';
        webSearchToggle.style.backgroundColor = 'rgba(255, 153, 0, 0.2)';
        webSearchToggle.title = "Web Search: ON";
    } else {
        webSearchIcon.style.filter = 'grayscale(100%)';
        webSearchToggle.style.backgroundColor = '';
        webSearchToggle.title = "Web Search: Auto/Off";
    }
});

function fetchWebSearch(query) {
    return new Promise(function(resolve) {
        var url = OODLES_SEARCH_URL + '?q=' + encodeURIComponent(query) + '&page=1&pageSize=6';
        
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (!data.items || data.items.length === 0) {
                        console.log("Search results for '" + query + "':", 'No web links found.');
                        resolve('No web links found.');
                        return;
                    }
                    var limit = data.items.length;
                    if (limit > 3) {
                        limit = 3;
                    }

                    var formatted = "";
                    for (var i = 0; i < limit; i++) {
                        var r = data.items[i];
                        if (!r) {
                            continue;
                        }
                        
                        var fullSnippet = "No snippet available.";
                        if (r.snippet) {
                            fullSnippet = r.snippet.trim();
                        }

                        var titleText = "No title";
                        if (r.title) {
                            titleText = r.title;
                        }

                        var line = "[Index " + i + "] Title: " + titleText + ". Snippet: " + fullSnippet;

                        if (i === 0) {
                            formatted = line;
                        } else {
                            formatted = formatted + "\n---\n" + line;
                        }
                    }
                    console.log("Search results for '" + query + "':", formatted);
                    resolve(formatted);
                  
                } catch (e) {
                    console.log("Search results error parsing JSON for '" + query + "':", e);
                    resolve('No web links found.');
                }
            } else {
                console.error('Oodles search error status:', xhr.status);
                resolve('Web search failed or timed out. Please proceed with your existing knowledge.');
            }
        };
        
        xhr.onerror = function() {
            console.error('Oodles search network error');
            resolve('Web search failed or timed out. Please proceed with your existing knowledge.');
        };
        
        xhr.send();
    });
}

function buildPollinationsUrl(prompt) {
    var encoded = encodeURIComponent(prompt);
    var seed = Math.floor(Math.random() * 999999);
    return 'https://image.pollinations.ai/prompt/' + encoded 
        + '?nologo=true&width=768&height=512&seed=' + seed + '&model=flux&enhance=false';
}

async function generateImageWithRetry(prompt, maxRetries) {
    maxRetries = maxRetries || 3;
    var delay = 4000; 

    for (var attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            var url = buildPollinationsUrl(prompt);
            var result = await new Promise(function(resolve, reject) {
                var img = new Image();
                img.onload = function() { resolve(url); };
                img.onerror = function() { reject(new Error('Image failed')); };
                setTimeout(function() { reject(new Error('Timeout')); }, 20000);
                img.src = url;
            });
            return result; 
        } catch (err) {
            console.warn('Pollinations attempt ' + attempt + ' failed:', err.message);
            if (attempt < maxRetries) {
                typingIndicator.innerHTML = 'Image queue busy, retrying in ' + (delay/1000) + 's... (attempt ' + attempt + '/' + maxRetries + ')';
                await new Promise(function(r) { return setTimeout(r, delay); });
                delay += 2000; 
            }
        }
    }
    return null; 
}

// --- Active AI Welcome Title Generation ---
function generatePraterichWelcomeTitle(titleElement) {
    var payload = {
        contents: [{ 
            role: "user", 
            parts: [{ text: "Generate a short, humorious, odd greeting(relating to that you are tired of your career as a chatbot in the datacentre) or welcome header text for a user starting a fresh chat session with you. It must be under 35 characters, direct, open-ended, and unique. Output ONLY the greeting line, no quote wrappers, no trailing punctuation." }] 
        }],
        system_instruction: { parts: [{ text: "You are Praterich, an intelligent and modern AI. Respond only with the requested custom greeting string." }] }
    };

    ajax('POST', API_URL, payload, function(data) {
        if (data && data.text) {
            titleElement.textContent = data.text.replace(/["']/g, "").trim();
        } else {
            titleElement.textContent = "Meet Praterich";
        }
    }, function(err) {
        console.error("Failed to actively generate welcome title:", err);
        titleElement.textContent = "Meet Praterich";
    });
}

// --- Core Functions ---

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    return text; 
}

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

    if (speakableText.length > 200) {
        window.speechSynthesis.cancel();
    }

    window.speechSynthesis.speak(utterance);
}

function addMessage(text, sender, isHistoryLoad) {
    var message = { text: text, sender: sender };
    
    if (!isHistoryLoad && currentChatId) {
        chatSessions[currentChatId].messages.push(message);
        saveToLocalStorage();
    }

    var messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
    var contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    contentDiv.innerHTML = renderMarkdown(text);

    contentDiv.querySelectorAll('img').forEach(function(img) {
        img.style.maxWidth = '100%';
        img.style.borderRadius = '10px';
        img.style.display = 'block';
        img.style.marginTop = '8px';
        img.alt = img.alt || 'Generated image';
        img.style.minHeight = '80px';
        img.style.background = 'rgba(0,0,0,0.05)';
        img.addEventListener('load', function() {
            img.style.minHeight = '';
            img.style.background = '';
        });
        img.addEventListener('error', function() {
            img.alt = ' Image failed to load. Try again.';
            img.style.minHeight = '';
        });
    });

    if (sender === 'ai' && !isHistoryLoad) {
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'ai-message-actions';

        var copyBtn = document.createElement('button');
        copyBtn.className = 'action-button copy-button';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.onclick = function() { navigator.clipboard.writeText(contentDiv.innerText); };
        
        var voiceBtn = document.createElement('button');
        voiceBtn.className = 'action-button voice-toggle-button';
        voiceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        voiceBtn.onclick = function() { window.speechSynthesis.cancel(); };
        
        actionsDiv.appendChild(copyBtn);
        actionsDiv.appendChild(voiceBtn);
        contentDiv.appendChild(actionsDiv);
    }

    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
    
    if (sender === 'ai' && !isHistoryLoad) speakText(text);
}

function addUserMessageWithImage(text, imageBase64, mimeType) {
    var storedText = text;
    if (currentChatId) {
        chatSessions[currentChatId].messages.push({ text: storedText, sender: 'user' });
        saveToLocalStorage();
    }

    var messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    var contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (imageBase64 && mimeType && mimeType.startsWith('image/')) {
        var img = document.createElement('img');
        img.src = imageBase64;
        img.style.maxWidth = '220px';
        img.style.maxHeight = '180px';
        img.style.borderRadius = '10px';
        img.style.display = 'block';
        img.style.marginBottom = '8px';
        contentDiv.appendChild(img);
    }

    if (text) {
        var textDiv = document.createElement('div');
        textDiv.innerHTML = renderMarkdown(text);
        contentDiv.appendChild(textDiv);
    }

    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}

async function sendMessage() {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    var userText = userInput.value.trim();
    var fileToAttach = attachedFile;
    if (!userText && !fileToAttach) return;

    // Remove welcome header components on message dispatch
    var welcomeContainer = document.getElementById('welcome-container');
    if (welcomeContainer) {
        welcomeContainer.remove();
    }
    chatWindow.classList.add('has-messages');

    userInput.value = '';
    updateCharCount();
    clearAttachedFile();

    var isImageAttachment = fileToAttach && fileToAttach.mimeType && fileToAttach.mimeType.startsWith('image/');
    
    if (isImageAttachment) {
        var displayText = userText || '';
        addUserMessageWithImage(displayText, fileToAttach.base64Data, fileToAttach.mimeType);
    } else {
        var messageText = userText;
        if (fileToAttach) {
            messageText += '\n\n**[File Attached]**\n- **Name:** ' + fileToAttach.fileName + '\n- **Type:** ' + fileToAttach.mimeType;
        }
        addMessage(messageText, 'user');
    }

    var currentSession = chatSessions[currentChatId];
    if (currentSession.title === "New Chat") {
        currentSession.title = (userText || (fileToAttach && fileToAttach.fileName) || "Chat with File").substring(0, 30).trim();
        renderChatList();
        saveToLocalStorage();
    }

    var conversationHistory = chatSessions[currentChatId].messages.slice(0, -1).map(function(msg) {
        return { role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] };
    });

    var newContentParts = [];
    if (fileToAttach && isImageAttachment) {
        newContentParts.push({
            inlineData: {
                mimeType: fileToAttach.mimeType,
                data: fileToAttach.base64Data.split(',')[1]
            }
        });
    } else if (fileToAttach) {
        userText = (userText || '') + '\n\n[File Attached: ' + fileToAttach.fileName + ', type: ' + fileToAttach.mimeType + ']';
    }
    newContentParts.push({ text: userText || "Please analyze this image and describe what you see." });
    conversationHistory.push({ role: "user", parts: newContentParts });

    typingIndicator.style.display = 'block';
    scrollToBottom();

    var isFinalAnswer = false;
    var turnCount = 0;

    try {
        while (!isFinalAnswer && turnCount < 3) {
            turnCount++;

            if (isWebSearchEnabled && turnCount === 1) {
                var lastIndex = conversationHistory.length - 1;
                var lastParts = conversationHistory[lastIndex].parts;
                var lastTextPart = lastParts[lastParts.length - 1];
                lastTextPart.text = (lastTextPart.text || '') + "\n\n[SYSTEM NOTE: The user has manually enabled Web Search. If this query requires factual, external, or up-to-date knowledge, you MUST output @@SEARCH: query@@ to look it up.]";
            }

            var requestBody = {
                contents: conversationHistory,
                system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
            };

           
            var aiRawText = await new Promise(function(resolve, reject) {
                ajax('POST', API_URL, requestBody, function(data) {
                    if (data && data.text) {
                        resolve(data.text);
                    } else {
                        reject(new Error('Empty response from API.'));
                    }
                }, function(xhr) {
                    reject(new Error('HTTP error! status: ' + (xhr ? xhr.status : 'unknown')));
                });
            });

            if (!aiRawText || aiRawText.trim() === '') {
                throw new Error('Empty response from API.');
            }

            var imageRegex = /@@IMAGE:\s*(.*?)@@/s;
            var imageMatch = aiRawText.match(imageRegex);

            var searchRegex = /@@SEARCH:\s*(.*?)@@/s;
            var searchMatch = aiRawText.match(searchRegex);

            if (imageMatch) {
                var imagePrompt = imageMatch[1].trim();
                typingIndicator.innerHTML = 'Praterich is generating an image of <b>"' + imagePrompt.substring(0, 50) + '..."</b>';
                
                var imageUrl = buildPollinationsUrl(imagePrompt);
                var imageMarkdown = '![' + imagePrompt + '](' + imageUrl + ')';
                
                isFinalAnswer = true;
                typingIndicator.style.display = 'none';
                typingIndicator.innerHTML = "Praterich A.I. is typing...";
                addMessage(imageMarkdown, 'ai');

            } else if (searchMatch) {
                var searchQuery = searchMatch[1].trim();
                typingIndicator.innerHTML = 'Praterich is searching the web for <b>"' + searchQuery + '"</b>...';
                
                var searchResultsText = await fetchWebSearch(searchQuery);
                console.log('Praterich Search Results:', searchResultsText);

                conversationHistory.push({ role: "model", parts: [{ text: aiRawText }] });
                conversationHistory.push({ role: "user", parts: [{ text: '[TOOL_RESULT_FOR_PREVIOUS_TURN]\nWeb Search Results for "' + searchQuery + '":\n' + searchResultsText + '\n\nBased on these results, please provide your final answer to the original prompt.' }] });
                
                typingIndicator.innerHTML = "Praterich A.I. is typing...";
                scrollToBottom();

            } else {
                isFinalAnswer = true;
                typingIndicator.style.display = 'none';
                typingIndicator.innerHTML = "Praterich A.I. is typing...";
                addMessage(aiRawText, 'ai');
            }
        }
    } catch (error) {
        typingIndicator.style.display = 'none';
        typingIndicator.innerHTML = "Praterich A.I. is typing...";
        console.error('API Error:', error);
        addMessage("An API error occurred. Praterich A.I. apologizes — please check the console or try again.", 'ai');
    }
}

// --- Speech Recognition (STT) Logic ---
var recognition;
var isListening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        isListening = true;
        setMicActive(true);
    };

    recognition.onresult = function(event) {
        var transcript = event.results[0][0].transcript;
        userInput.value += transcript;
        updateCharCount(); 
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        stopListening();
    };

    recognition.onend = function() {
        stopListening();
    };
}

function stopListening() {
    isListening = false;
    recognition.stop();
    setMicActive(false);
}

function toggleListening() {
    if (!recognition) {
        alert("Your browser doesn't support speech recognition.");
        return;
    }
    if (isListening) {
        stopListening();
    } else {
        recognition.start();
    }
}

micButton.addEventListener('click', toggleListening);

// --- File Handling ---
function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleFileUpload(file) {
    if (!file) return;
    try {
        attachedFile = {
            base64Data: await fileToBase64(file),
            mimeType: file.type || 'application/octet-stream', 
            fileName: file.name
        };
        fileIcon.className = getFileIcon(file.name);
        fileNameDisplay.textContent = file.name;
        filePreviewContainer.style.display = 'flex';
        updateSendButtonState();
    } catch (error) {
        console.error("Error reading file:", error);
        alert("Could not read file.");
        clearAttachedFile();
    }
}

function clearAttachedFile() {
    attachedFile = null;
    filePreviewContainer.style.display = 'none';
    fileNameDisplay.textContent = '';
    fileUpload.value = ''; 
    updateSendButtonState();
}

fileUpload.addEventListener('change', function() {
    if (fileUpload.files[0]) handleFileUpload(fileUpload.files[0]);
});

// --- Chat Management and Storage ---
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
}

function loadFromLocalStorage() {
    var sessionsData = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (sessionsData) chatSessions = JSON.parse(sessionsData);

    var ids = Object.keys(chatSessions);
    if (ids.length === 0) {
        startNewChat();
    } else {
        ids.sort();
        currentChatId = ids[ids.length - 1]; 
        loadChatSession(currentChatId);
    }
    renderChatList();
}

function startNewChat() {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    var newId = generateUuid();
    chatSessions[newId] = {
        title: "New Chat",
        messages: []
    };
    currentChatId = newId;
    saveToLocalStorage();
    loadChatSession(newId);
    renderChatList();
    userInput.focus();
}

function loadChatSession(id) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    currentChatId = id;
    chatWindow.innerHTML = ''; 
    
    var session = chatSessions[id];

    if (session.messages.length === 0) {
        chatWindow.classList.remove('has-messages');
        
        var welcomeDiv = document.createElement('div');
        welcomeDiv.id = 'welcome-container';
        
        var titleH1 = document.createElement('h1');
        titleH1.id = 'welcome-title';
        titleH1.textContent = "Connecting to Praterich...";
        welcomeDiv.appendChild(titleH1);
        chatWindow.appendChild(welcomeDiv);

        // Fetch dynamic, generative title
        generatePraterichWelcomeTitle(titleH1);
        
        if (suggestionBox) {
            var clonedSuggestionBox = suggestionBox.cloneNode(true);
            clonedSuggestionBox.style.display = 'flex'; 
            chatWindow.appendChild(clonedSuggestionBox);
            
            if (typeof initSuggestionCycling === 'function') {
                initSuggestionCycling();
            }
        }
    } else {
        chatWindow.classList.add('has-messages');
    }

    session.messages.forEach(function(msg) { 
        addMessage(msg.text, msg.sender, true); 
    });
    
    renderChatList(); 
    scrollToBottom();
}

function deleteChatSession(id) {
    if (id === currentChatId) startNewChat(); 
    delete chatSessions[id];
    saveToLocalStorage();
    renderChatList();
}

function renderChatList() {
    chatList.innerHTML = '';
    var ids = Object.keys(chatSessions).sort().reverse(); 

    ids.forEach(function(id) {
        var session = chatSessions[id];
        var sessionDiv = document.createElement('div');
        sessionDiv.className = 'chat-session' + (id === currentChatId ? ' active' : '');
        
        var titleSpan = document.createElement('span');
        titleSpan.className = 'chat-title';
        titleSpan.textContent = session.title;
        titleSpan.onclick = function() { loadChatSession(id); };
        sessionDiv.appendChild(titleSpan);

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat';
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.onclick = function(e) {
            e.stopPropagation(); 
            if (confirm('Are you sure you want to delete this chat?')) deleteChatSession(id);
        };
        sessionDiv.appendChild(deleteBtn);
        chatList.appendChild(sessionDiv);
    });
}

window.addEventListener('load', loadFromLocalStorage);
newChatButton.addEventListener('click', startNewChat);
sendButton.addEventListener('click', sendMessage);
updateCharCount();
