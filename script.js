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

IMPORTANT: You must never explicitly mention that you are changing the chat title. Infer the title based on the user's first message and use a maximum of 30 characters.
`;

var initialGreeting = "Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?";

// --- Web Search Functions ---

// Toggle search manually via the UI button
webSearchToggle.addEventListener('click', function() {
    isWebSearchEnabled = !isWebSearchEnabled;
    if (isWebSearchEnabled) {
        webSearchIcon.style.filter = 'grayscale(0%)';
        webSearchToggle.style.backgroundColor = 'rgba(255, 153, 0, 0.2)'; // Light orange highlight
        webSearchToggle.title = "Web Search: ON";
    } else {
        webSearchIcon.style.filter = 'grayscale(100%)';
        webSearchToggle.style.backgroundColor = '';
        webSearchToggle.title = "Web Search: Auto/Off";
    }
});

// Execute the fetch to the Oodles backend
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
    var speakableText = text;
    for (var word in customPronunciations) {
        speakableText = speakableText.replace(new RegExp('\\b' + word + '\\b', 'gi'), customPronunciations[word]);
    }
    var utterance = new SpeechSynthesisUtterance(speakableText);
    utterance.rate = 1.3; 
    utterance.pitch = 1.0;
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

    if (sender === 'user') {
        contentDiv.innerHTML = renderMarkdown(text); 
    } else {
        contentDiv.innerHTML = renderMarkdown(text);
        if (!isHistoryLoad) {
            var actionsDiv = document.createElement('div');
            actionsDiv.className = 'ai-message-actions';

            var copyBtn = document.createElement('button');
            copyBtn.className = 'action-button copy-button';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.onclick = () => navigator.clipboard.writeText(contentDiv.innerText);
            
            var voiceBtn = document.createElement('button');
            voiceBtn.className = 'action-button voice-toggle-button';
            voiceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            voiceBtn.onclick = () => window.speechSynthesis.cancel();
            
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(voiceBtn);
            contentDiv.appendChild(actionsDiv);
        }
    }

    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
    
    if (sender === 'ai' && !isHistoryLoad) speakText(text);
}

// The core loop: allows Praterich to call the search tool if needed, then answer.
async function sendMessage() {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    var userText = userInput.value.trim();
    var fileToAttach = attachedFile;
    if (!userText && !fileToAttach) return;

    userInput.value = '';
    updateCharCount();
    
    var messageText = userText;
    if (fileToAttach) {
        messageText += `\n\n**[File Attached]**\n- **Name:** ${fileToAttach.fileName}\n- **Type:** ${fileToAttach.mimeType}`;
    }
    
    addMessage(messageText, 'user');
    clearAttachedFile();

    // Dynamic Chat Renaming
    var currentSession = chatSessions[currentChatId];
    if (currentSession.title === "New Chat") {
        currentSession.title = userText.substring(0, 30).trim() || fileToAttach?.fileName.substring(0, 30).trim() || "Chat with File"; 
        renderChatList();
        saveToLocalStorage();
    }

    // Prepare Base Conversation History
    var conversationHistory = chatSessions[currentChatId].messages.slice(0, -1).map(function(msg) {
        return { role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] };
    });

    var newContentParts = [];
    if (fileToAttach) {
        newContentParts.push({ inlineData: { mimeType: fileToAttach.mimeType, data: fileToAttach.base64Data.split(',')[1] } });
    }
    newContentParts.push({ text: userText || "Analyze this file." });
    conversationHistory.push({ role: "user", parts: newContentParts });

    typingIndicator.style.display = 'block';
    scrollToBottom();

    // --- TOOL CALLING LOOP ---
    var isFinalAnswer = false;
    var turnCount = 0;

    try {
        while (!isFinalAnswer && turnCount < 3) {
            turnCount++;

            // If the user forced Web Search on, silently append an instruction to their first prompt
            if (isWebSearchEnabled && turnCount === 1) {
                var lastIndex = conversationHistory.length - 1;
                var currentText = conversationHistory[lastIndex].parts[conversationHistory[lastIndex].parts.length - 1].text;
                conversationHistory[lastIndex].parts[conversationHistory[lastIndex].parts.length - 1].text = currentText + "\n\n[SYSTEM NOTE: The user has manually enabled Web Search. If this query requires factual, external, or up-to-date knowledge, you MUST output @@SEARCH: query@@ to look it up.]";
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

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            var data = await response.json();
            var aiRawText = data.text;

            // Check if Praterich triggered the Web Search Command
            var searchRegex = /@@SEARCH:\s*(.*?)@@/;
            var searchMatch = aiRawText.match(searchRegex);

            if (searchMatch) {
                // Execute Search
                var searchQuery = searchMatch[1].trim();
                typingIndicator.innerHTML = `Praterich is searching the web for <b>"${searchQuery}"</b>...`;
                
                var searchResultsText = await fetchWebSearch(searchQuery);

                // Provide results back to her history for the next iteration
                conversationHistory.push({ role: "model", parts: [{ text: aiRawText }] });
                conversationHistory.push({ role: "user", parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN]\nWeb Search Results for "${searchQuery}":\n${searchResultsText}\n\nBased on these results, please provide your final answer to the original prompt.` }] });
                
                // Reset indicator for the final generation
                typingIndicator.innerHTML = "Praterich A.I. is typing...";
                scrollToBottom();
            } else {
                // No search requested, this is the final answer
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
        addMessage("An API error occurred. Praterich A.I. apologizes. Please check the console or try again later.", 'ai');
    }
}


// --- File Handling ---
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
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
        clonedSuggestionBox.querySelectorAll('.suggestions-item').forEach(item => {
            item.addEventListener('click', function() {
                userInput.value = item.querySelector('p').textContent.trim();
                updateCharCount(); 
                userInput.focus();
            });
        });
    }

    chatSessions[id].messages.forEach(msg => addMessage(msg.text, msg.sender, true));
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
        titleSpan.onclick = () => loadChatSession(id);
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

// Initialization Binding
window.addEventListener('load', loadFromLocalStorage);
newChatButton.addEventListener('click', startNewChat);
sendButton.addEventListener('click', sendMessage);

// Make sure everything is visually up to date
updateCharCount();
