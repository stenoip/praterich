var API_URL = "https://praterich.vercel.app/api/praterich";
var OODLES_SEARCH_URL = "https://oodles-backend.vercel.app/metasearch";
var STORAGE_KEY_SESSIONS = 'praterich_chats';
var MAX_CHARS = 10710; 

// Custom Pronunciations for TTS
var customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Stick-no-ip"
};

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

var initialGreeting = "Hey there 👋 What's on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?";

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

async function fetchWebSearch(query) {
    try {
        var url = OODLES_SEARCH_URL + '?q=' + encodeURIComponent(query) + '&page=1&pageSize=6';
        var resp = await fetch(url);
        var data = await resp.json();
        
        if (!data.items || data.items.length === 0) return 'No web links found.';
        
        return data.items.map(function(r, index) {
            var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
            return `[Index ${index}] Title: ${r.title}. Snippet: ${fullSnippet}`;
        }).join('\n---\n');
    } catch (error) {
        console.error('Oodles search error:', error);
        return 'Web search failed or timed out. Please proceed with your existing knowledge.';
    }
}

function buildPollinationsUrl(prompt) {
    var encoded = encodeURIComponent(prompt);
    var seed = Math.floor(Math.random() * 999999);
    // flux model is faster and less congested than sana on the free tier
    return 'https://image.pollinations.ai/prompt/' + encoded 
        + '?nologo=true&width=768&height=512&seed=' + seed + '&model=flux&enhance=false';
}

async function generateImageWithRetry(prompt, maxRetries) {
    maxRetries = maxRetries || 3;
    var delay = 4000; // 4 seconds between retries

    for (var attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            var url = buildPollinationsUrl(prompt);
            // Pre-fetch to check if image loads before displaying
            var result = await new Promise(function(resolve, reject) {
                var img = new Image();
                img.onload = function() { resolve(url); };
                img.onerror = function() { reject(new Error('Image failed')); };
                // Timeout after 20 seconds
                setTimeout(function() { reject(new Error('Timeout')); }, 20000);
                img.src = url;
            });
            return result; // success
        } catch (err) {
            console.warn('Pollinations attempt ' + attempt + ' failed:', err.message);
            if (attempt < maxRetries) {
                typingIndicator.innerHTML = 'Image queue busy, retrying in ' + (delay/1000) + 's... (attempt ' + attempt + '/' + maxRetries + ')';
                await new Promise(function(r) { return setTimeout(r, delay); });
                delay += 2000; // back off a bit each retry
            }
        }
    }
    return null; // all retries failed
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

    // Strip markdown syntax and image tags before speaking
    var speakableText = text
        .replace(/!\[.*?\]\(.*?\)/g, 'generated image')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // keep link text, drop URL
        .replace(/```[\s\S]*?```/g, 'code block')   // replace code blocks
        .replace(/`[^`]+`/g, '')                     // inline code
        .replace(/[#*_~>]/g, '')                     // markdown symbols
        .trim();

    // Apply custom pronunciations — using split/join instead of regex
    // for consistent cross-browser behavior
    Object.keys(customPronunciations).forEach(function(word) {
        var replacement = customPronunciations[word];
        // Case-insensitive split on the whole word
        var parts = speakableText.split(new RegExp(word, 'gi'));
        // Rebuild with replacement, preserving surrounding text
        speakableText = parts.join(replacement);
    });

    var utterance = new SpeechSynthesisUtterance(speakableText);
    utterance.rate = 1.3;
    utterance.pitch = 1.1;   // slightly higher pitch helps on browsers with fewer voices
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    // Use the pre-picked female voice if available
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    // Firefox bug: long utterances get silently cut off — chunk if needed
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

    // Style any generated images inside the bubble
    contentDiv.querySelectorAll('img').forEach(function(img) {
        img.style.maxWidth = '100%';
        img.style.borderRadius = '10px';
        img.style.display = 'block';
        img.style.marginTop = '8px';
        img.alt = img.alt || 'Generated image';
        // Show a loading state
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

// Special function for user messages that include an uploaded image (shows thumbnail)
function addUserMessageWithImage(text, imageBase64, mimeType) {
    // Only store the text version (no base64) to keep localStorage lean
    var storedText = text;
    if (currentChatId) {
        chatSessions[currentChatId].messages.push({ text: storedText, sender: 'user' });
        saveToLocalStorage();
    }

    var messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    var contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Show the thumbnail
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

    // Add any text the user typed
    if (text) {
        var textDiv = document.createElement('div');
        textDiv.innerHTML = renderMarkdown(text);
        contentDiv.appendChild(textDiv);
    }

    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}

// The core loop: allows Praterich to call tools if needed, then answer.
async function sendMessage() {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    var userText = userInput.value.trim();
    var fileToAttach = attachedFile;
    if (!userText && !fileToAttach) return;

    userInput.value = '';
    updateCharCount();
    clearAttachedFile();

    // --- Display user message ---
    var isImageAttachment = fileToAttach && fileToAttach.mimeType && fileToAttach.mimeType.startsWith('image/');
    
    if (isImageAttachment) {
        // Show thumbnail + text in the user bubble
        var displayText = userText || '';
        addUserMessageWithImage(displayText, fileToAttach.base64Data, fileToAttach.mimeType);
    } else {
        var messageText = userText;
        if (fileToAttach) {
            messageText += '\n\n**[File Attached]**\n- **Name:** ' + fileToAttach.fileName + '\n- **Type:** ' + fileToAttach.mimeType;
        }
        addMessage(messageText, 'user');
    }

    // Dynamic Chat Renaming
    var currentSession = chatSessions[currentChatId];
    if (currentSession.title === "New Chat") {
        currentSession.title = (userText || (fileToAttach && fileToAttach.fileName) || "Chat with File").substring(0, 30).trim();
        renderChatList();
        saveToLocalStorage();
    }

    // Prepare Base Conversation History for API
    // Slice off the message we just pushed (it's added below as newContentParts)
    var conversationHistory = chatSessions[currentChatId].messages.slice(0, -1).map(function(msg) {
        return { role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] };
    });

    // Build the new user turn (may include image)
    var newContentParts = [];
    if (fileToAttach && isImageAttachment) {
        // Pass image as inlineData — praterich.js will convert this for Groq vision
        newContentParts.push({
            inlineData: {
                mimeType: fileToAttach.mimeType,
                data: fileToAttach.base64Data.split(',')[1]
            }
        });
    } else if (fileToAttach) {
        // Non-image file: just describe it in text
        userText = (userText || '') + '\n\n[File Attached: ' + fileToAttach.fileName + ', type: ' + fileToAttach.mimeType + ']';
    }
    newContentParts.push({ text: userText || "Please analyze this image and describe what you see." });
    conversationHistory.push({ role: "user", parts: newContentParts });

    typingIndicator.style.display = 'block';
    scrollToBottom();

    // --- TOOL CALLING LOOP ---
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

            var response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
            
            var data = await response.json();
            var aiRawText = data.text;

            if (!aiRawText || aiRawText.trim() === '') {
                throw new Error('Empty response from API.');
            }

            // --- Check for IMAGE tool ---
            var imageRegex = /@@IMAGE:\s*(.*?)@@/s;
            var imageMatch = aiRawText.match(imageRegex);

            // --- Check for SEARCH tool ---
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
        messages: [{ sender: 'ai', text: initialGreeting }]
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
    
    if (suggestionBox) {
        var clonedSuggestionBox = suggestionBox.cloneNode(true);
        chatWindow.appendChild(clonedSuggestionBox);
        clonedSuggestionBox.querySelectorAll('.suggestions-item').forEach(function(item) {
            item.addEventListener('click', function() {
                userInput.value = item.querySelector('p').textContent.trim();
                updateCharCount(); 
                userInput.focus();
            });
        });
    }

    chatSessions[id].messages.forEach(function(msg) { addMessage(msg.text, msg.sender, true); });
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

// Initialization
window.addEventListener('load', loadFromLocalStorage);
newChatButton.addEventListener('click', startNewChat);
sendButton.addEventListener('click', sendMessage);
updateCharCount();
