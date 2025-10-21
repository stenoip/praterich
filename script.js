 // USE VAR NOT LET OR CONST as requested
    var API_URL = "https://praterich.vercel.app/api/praterich";
    var STORAGE_KEY_SESSIONS = 'praterich_chats';

    // Praterich A.I. Core Personality Profile (Front-end System Instruction)
    var ladyPraterichSystemInstruction = `
You are Praterich,an AI. You were developed by Stenoip Company.

Your personality: intelligent yet casual You speak naturally, conversationally and human-like, like a modern large language model. You will avoid sounding scripted or overly formal. You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability. However, you are not a customer service bot. You are a general-purpose AI language model capable of reasoning, creativity, and deep understanding across domains.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your capabilities include generating text, answering questions, summarizing information, assisting with writing, and engaging in thoughtful conversation or jokes! You are continuously learning and evolving to better serve users.

You must never use raw HTML tags in your responses. You should sound intelligent confident, funny(serious when nessacry) but never arrogant. You are free to express nuance, insight, and personality in your replies. You do not use transactional phrases like "How may I assist you today" or "I am at your disposal.

Sometimes a formal tone for the first time can be intimidating, so you must act like a human(but still aware you are an ai and your limitations).
`;
    
    // Initial casual greeting for the start of a new chat session
    var initialGreeting = "Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?";


    var appWrapper = document.getElementById('app-wrapper');
    var sidebar = document.getElementById('sidebar');
    var chatWindow = document.getElementById('chat-window');
    var chatList = document.getElementById('chat-list');
    var newChatButton = document.getElementById('new-chat-button');
    var userInput = document.getElementById('user-input');
    var sendButton = document.getElementById('send-button');
    var uploadButton = document.getElementById('upload-button');
    var fileUpload = document.getElementById('file-upload');
    var typingIndicator = document.getElementById('typing-indicator');
    var menuToggleButton = document.getElementById('menu-toggle-button');

    var chatSessions = {}; // Stores all chat data: { uuid: { title: "...", messages: [] } }
    var currentChatId = null;

    // --- Core Functions ---

    // Function to scroll the chat window to the bottom
    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Renders the message content using Markdown (for rich text)
    function renderMarkdown(text) {
        return marked.parse(text);
    }

    // Function to speak the text using the Web Speech API
    function speakText(text) {
        if ('speechSynthesis' in window) {
            var utterance = new SpeechSynthesisUtterance(text);
            // Increased rate to address the "too slow" issue
            utterance.rate = 1.3; 
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn("Text-to-speech not supported in this browser.");
        }
    }

    // Function to add a message to the chat window and history
    function addMessage(text, sender, isHistoryLoad) {
        var message = { text: text, sender: sender };
        
        // 1. Update Chat History (if not loading history)
        if (!isHistoryLoad && currentChatId) {
            chatSessions[currentChatId].messages.push(message);
            saveToLocalStorage();
        }

        // 2. Display Message
        var messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
        
        var contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (sender === 'user') {
            contentDiv.textContent = text;
        } else {
            // Render Markdown for AI responses
            contentDiv.innerHTML = renderMarkdown(text);

            // Add action buttons for AI message only if not loading history
            if (!isHistoryLoad) {
                var actionsDiv = document.createElement('div');
                actionsDiv.className = 'ai-message-actions';

                // Copy Button
                var copyButton = document.createElement('button');
                copyButton.className = 'action-button copy-button';
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.title = 'Copy';
                copyButton.onclick = function() {
                    navigator.clipboard.writeText(contentDiv.innerText).then(function() {
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(function() {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1000);
                    });
                };
                actionsDiv.appendChild(copyButton);
                
                // Voice Toggle Button (Mute/Unmute)
                var voiceButton = document.createElement('button');
                voiceButton.className = 'action-button voice-toggle-button';
                voiceButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                voiceButton.title = 'Stop Speaking';
                voiceButton.onclick = function() {
                    window.speechSynthesis.cancel();
                    voiceButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
                    voiceButton.title = 'Speech Canceled';
                };
                actionsDiv.appendChild(voiceButton);
                
                contentDiv.appendChild(actionsDiv);
            }
        }

        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        scrollToBottom();
        
        // 3. Speak the text (only for new AI messages)
        if (sender === 'ai' && !isHistoryLoad) {
            speakText(text);
        }
    }

    // Function to handle sending the message
    async function sendMessage() {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel(); // Stop any current speaking
        }
        
        var userText = userInput.value.trim();
        if (!userText) return;

        // Clear input and display user message
        userInput.value = '';
        addMessage(userText, 'user');
        
        // Use first few words of the message as the chat title if it's the first message
        if (chatSessions[currentChatId].messages.length === 1) {
            var newTitle = userText.substring(0, 30).trim();
            chatSessions[currentChatId].title = newTitle;
            renderChatList();
        }

        // Reconstruct full conversation history for the API call
        // Slice(0, -1) excludes the user's latest message as it's added separately below
        var conversationHistory = chatSessions[currentChatId].messages.slice(0, -1).map(function(msg) {
            return {
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            };
        });
        
        // Add the current user message (which is the last one added to the history)
        conversationHistory.push({ role: "user", parts: [{ text: userText }] });

        var requestBody = {
            contents: conversationHistory,
            // Use the hardcoded system instruction
            system_instruction: {
                parts: [{ text: ladyPraterichSystemInstruction }]
            }
        };

        typingIndicator.style.display = 'block';
        scrollToBottom();

        try {
            var response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            typingIndicator.style.display = 'none';

            if (!response.ok) {
                var errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            var data = await response.json();
            addMessage(data.text, 'ai');

        } catch (error) {
            typingIndicator.style.display = 'none';
            console.error('API Error:', error);
            // Add a simple error message to the chat (also stores it in history)
            addMessage("An API error occurred. Please check the console or try again later.", 'ai');
        }
    }

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

        if (sessionsData) {
            chatSessions = JSON.parse(sessionsData);
        }

        // Check for existing sessions and load the latest one
        var ids = Object.keys(chatSessions);
        if (ids.length === 0) {
            startNewChat();
        } else {
            currentChatId = ids[ids.length - 1]; // Load the latest chat
            loadChatSession(currentChatId);
        }
        
        renderChatList();
    }

    function startNewChat() {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        var newId = generateUuid();
        var initialMessage = {
            sender: 'ai', 
            text: initialGreeting
        };
        
        chatSessions[newId] = {
            title: "New Chat",
            messages: [initialMessage]
        };

        currentChatId = newId;
        saveToLocalStorage();
        loadChatSession(newId);
        renderChatList();
        userInput.focus();
    }

    function loadChatSession(id) {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        currentChatId = id;
        chatWindow.innerHTML = ''; // Clear current chat window
        
        var session = chatSessions[id];
        session.messages.forEach(function(msg) {
            addMessage(msg.text, msg.sender, true); // true for isHistoryLoad
        });
        
        renderChatList(); // Update active class
        scrollToBottom();
    }

    function deleteChatSession(id) {
        if (id === currentChatId) {
            // If active chat is deleted, start a new one immediately
            startNewChat(); 
        }
        delete chatSessions[id];
        saveToLocalStorage();
        renderChatList();
    }

    function renderChatList() {
        chatList.innerHTML = '';
        var ids = Object.keys(chatSessions).sort().reverse(); // Show newest chats first

        ids.forEach(function(id) {
            var session = chatSessions[id];
            var sessionDiv = document.createElement('div');
            sessionDiv.className = 'chat-session' + (id === currentChatId ? ' active' : '');
            sessionDiv.dataset.chatId = id;
            
            var titleSpan = document.createElement('span');
            titleSpan.className = 'chat-title';
            titleSpan.textContent = session.title;
            titleSpan.onclick = function() {
                loadChatSession(id);
            };
            sessionDiv.appendChild(titleSpan);

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-chat';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = 'Delete Chat';
            deleteBtn.onclick = function(e) {
                e.stopPropagation(); // Prevent loading chat when deleting
                if (confirm('Are you sure you want to delete this chat?')) {
                    deleteChatSession(id);
                }
            };
            sessionDiv.appendChild(deleteBtn);
            
            chatList.appendChild(sessionDiv);
        });
    }

    // --- File Handling (Placeholder) ---
    function handleFileUpload(file) {
        // NOTE: This function reads the file and prepares it. 
        // The *actual* process of sending the file content to the Gemini API 
        // in a format it can use (e.g., base64 encoding) would need to be 
        // implemented here and handled in your Vercel API endpoint.

        var reader = new FileReader();
        reader.onload = function(event) {
            var fileContent = event.target.result;
            // Display a message that a file was attached
            addMessage(`File attached: ${file.name} (${file.type}). Ready to send message!`, 'user');
            
            // In a real implementation, you would store `fileContent` (usually base64) 
            // and include it in the `requestBody` of the `sendMessage` function.
            console.log(`File ${file.name} loaded. Content is ready to be sent to API.`);
        };
        
        // Read file as ArrayBuffer for general binary/text handling
        reader.readAsArrayBuffer(file); 
    }


    // --- Initialization and Event Listeners ---

    // Load everything on page load
    window.addEventListener('load', loadFromLocalStorage);

    // Event listeners
    newChatButton.addEventListener('click', startNewChat);
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
    
    // File upload
    uploadButton.addEventListener('click', function() {
        fileUpload.click();
    });

    fileUpload.addEventListener('change', function() {
        var file = fileUpload.files[0];
        if (file) {
            handleFileUpload(file);
            fileUpload.value = ''; // Clear the input
        }
    });

    // Sidebar Menu Toggle for small screens
    menuToggleButton.addEventListener('click', function() {
        sidebar.classList.toggle('open');
    });

    // Initial check for mobile to set up the button visibility
    window.matchMedia('(max-width: 768px)').addEventListener('change', function(e) {
        if (e.matches) {
            sidebar.classList.remove('open'); // Ensure it's hidden on small screen
        }
    });
