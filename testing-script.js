// --- Core DOM Elements ---
var chatsContainer = document.querySelector(".chats-container");
var promptForm = document.querySelector(".prompt-form");
var promptInput = promptForm.querySelector(".prompt-input");
var fileInput = promptForm.querySelector("#file-input");
var fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
var themeToggleBtn = document.querySelector("#theme-toggle-btn");
var stopResponseBtn = document.querySelector("#stop-response-btn");
var deleteChatsBtn = document.querySelector("#delete-chats-btn");
var menuBtn = document.querySelector("#menu-btn");
var recentChatsPanel = document.querySelector(".recent-chats-panel");
var newChatBtn = document.querySelector("#new-chat-btn");
var dummyChatBtn = document.querySelector(".dummy-chat");

var API_URL = "https://praterich.vercel.app/api/praterich";

var controller, typingInterval;
var speechUtterance;
var voicesLoaded = false;
var availableVoices = [];
var chatHistory = []; // Stores the current chat session's history
var userData = { message: "", file: {} };

// --- Custom Pronunciations ---
var customPronunciations = {
    "Praterich": "Prah-ter-rich",
    "Stenoip": "Stick-noh-ip"
};

var replacePronunciations = (text) => {
    var spokenText = text;
    for (var word in customPronunciations) {
        var regex = new RegExp(word, 'gi');
        spokenText = spokenText.replace(regex, customPronunciations[word]);
    }
    return spokenText;
};

// --- Theme Setup ---
var isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

// --- Speech Synthesis ---
var loadVoices = () => {
    availableVoices = window.speechSynthesis.getVoices();
    voicesLoaded = true;
};
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
}

// --- Message UI ---
var createMessageElement = (content, ...classes) => {
    var div = document.createElement("div");
    div.classList.add("message", ...classes);
    
    var messageTextElement = document.createElement("p");
    messageTextElement.classList.add("message-text");
    messageTextElement.innerHTML = content;

    if (classes.includes("bot-message") && !classes.includes("loading")) {
        // Wrap the entire message text content in a div to properly house formatted elements
        var contentWrapper = document.createElement('div');
        contentWrapper.classList.add('bot-content-wrapper'); // New class for better targeting
        contentWrapper.appendChild(messageTextElement);
        
        var copyButtonHTML = `<span onclick="copyMessage(this)" class="icon material-symbols-rounded">content_copy</span>`;
        div.innerHTML = contentWrapper.innerHTML + copyButtonHTML;
    } else {
        div.innerHTML = messageTextElement.outerHTML;
    }
    
    return div;
};

var scrollToBottom = () => chatsContainer.scrollTo({ top: chatsContainer.scrollHeight, behavior: "smooth" });

// --- Copy Message Functionality ---
function copyMessage(buttonElement) {
    var messageElement = buttonElement.closest('.message');
    var textElement = messageElement.querySelector('.message-text');

    if (textElement) {
        navigator.clipboard.writeText(textElement.textContent)
            .then(() => {
                buttonElement.textContent = 'check';
                setTimeout(() => {
                    buttonElement.textContent = 'content_copy';
                }, 1500);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
            });
    }
}

// --- Typing Effect & Speech ---
var typingEffect = (text, textElement, botMsgDiv) => {
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    var plainText = tempDiv.textContent || tempDiv.innerText || "";
    plainText = replacePronunciations(plainText);

    if (speechUtterance && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    if (window.speechSynthesis && plainText.length > 0) {
        speechUtterance = new SpeechSynthesisUtterance(plainText);
        speechUtterance.rate = 1.0;
        speechUtterance.pitch = 1.0;
        speechUtterance.lang = 'en-US';

        if (voicesLoaded) {
            var selectedVoice = availableVoices.find(voice =>
                voice.lang === 'en-US' && voice.name.includes('Google US English') && voice.name.includes('Male')
            ) || availableVoices.find(voice => voice.lang === 'en-US');

            if (selectedVoice) {
                speechUtterance.voice = selectedVoice;
            }
        }
        window.speechSynthesis.speak(speechUtterance);
    }

    textElement.innerHTML = "";
    var charIndex = 0;
    var delay = 10;

    typingInterval = setInterval(() => {
        if (charIndex < text.length) {
            var nextChar = text.charAt(charIndex);
            // Handle HTML tags (like <strong>, <ul>, <li>) correctly during typing
            if (nextChar === '<') {
                var endIndex = text.indexOf('>', charIndex);
                if (endIndex !== -1) {
                    nextChar = text.substring(charIndex, endIndex + 1);
                    charIndex = endIndex;
                }
            }
            textElement.innerHTML += nextChar;
            charIndex++;
            scrollToBottom();
        } else {
            clearInterval(typingInterval);
            enhanceCodeBlocksWithCopy(botMsgDiv);
            botMsgDiv.classList.remove("loading");
            document.body.classList.remove("bot-responding");
            saveChats();
        }
    }, delay);
};

// --- Markdown Formatting (MAJOR FIX for lists and layout) ---
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (m) {
        return (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] || m
        );
    });
}

var formatResponseText = (text) => {
    // 1. Escape HTML for safe insertion (important before adding markdown tags)
    var lines = text.split('\n');
    var escapedLines = lines.map(line => escapeHtml(line));
    text = escapedLines.join('\n');
    
    // 2. Handle Code Blocks (must be done before other formatting)
    text = text.replace(/```(\w*)\s*([\s\S]*?)```/g, function (_, lang, code) {
        var safeCode = code; // Already escaped in step 1
        return `
            <div class="code-block-container">
                <button class="copy-code-btn" title="Copy code">Copy</button>
                <pre><code${lang ? ' class="language-' + lang + '"' : ""}>${safeCode}</code></pre>
            </div>
        `;
    });
    
    // 3. Handle Inline Code
    text = text.replace(/`([^`]+?)`/g, "<code>$1</code>");

    // 4. Handle Basic Formatting
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    text = text.replace(/(?<!\_)\_(?!\_)(.*?)(?<!\_)\_(?!\_)/g, "<em>$1</em>");
    text = text.replace(/__(.*?)__/g, "<u>$1</u>");
    text = text.replace(/^---\s*$/gm, "<hr>");
    text = text.replace(/\[([^\]]+)]\((https?:\/\/[^\)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`);

    // 5. Handle Headings
    text = text.replace(/^(#{1,6})\s*(.*?)$/gm, (match, hashes, content) => {
        var level = hashes.length;
        return `<h${level}>${content.trim()}</h${level}>`;
    });

    // 6. Handle Lists (Crucial fix for bullet points)
    var finalLines = [];
    var inList = false;
    var inOrderedList = false;

    text.split('\n').forEach(line => {
        var trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
            if (inOrderedList) { finalLines.push('</ol>'); inOrderedList = false; }
            if (!inList) { finalLines.push('<ul>'); inList = true; }
            finalLines.push(`<li>${trimmedLine.substring(2).trim()}</li>`);
        } else if (/^\d+\.\s/.test(trimmedLine)) {
            if (inList) { finalLines.push('</ul>'); inList = false; }
            if (!inOrderedList) { finalLines.push('<ol>'); inOrderedList = true; }
            // Remove the number and period for the list item content
            finalLines.push(`<li>${trimmedLine.replace(/^\d+\.\s*/, '').trim()}</li>`);
        } else {
            if (inList) { finalLines.push('</ul>'); inList = false; }
            if (inOrderedList) { finalLines.push('</ol>'); inOrderedList = false; }
            // Treat non-list lines as paragraphs or just text
            if (trimmedLine.length > 0) {
                finalLines.push(`<p>${trimmedLine}</p>`);
            } else {
                finalLines.push('');
            }
        }
    });
    
    if (inList) { finalLines.push('</ul>'); }
    if (inOrderedList) { finalLines.push('</ol>'); }

    text = finalLines.join('\n');
    
    // Clean up empty paragraph tags that might surround lists or code blocks
    text = text.replace(/<p>\s*(<ul>|<\/ul>|<ol>|<\/ol>|<div class="code-block-container")/g, '$1')
               .replace(/(<\/ul>|<\/ol>|<\/div>)\s*<\/p>/g, '$1');

    return text;
};

// --- Add copy button functionality to code blocks ---
function enhanceCodeBlocksWithCopy(container) {
    var blocks = container.querySelectorAll('.code-block-container');
    blocks.forEach(block => {
        var btn = block.querySelector('.copy-code-btn');
        var code = block.querySelector('pre code');
        if (btn && code) {
            btn.onclick = () => {
                var codeText = code.textContent;
                navigator.clipboard.writeText(codeText).then(() => {
                    btn.textContent = "Copied!";
                    setTimeout(() => (btn.textContent = "Copy"), 1300);
                });
            };
        }
    });
}

// --- News fetching logic (Omitted for brevity, kept essential functions) ---
var NEWS_FEEDS = [
    { name: "BBC", api: "https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml" },
    { name: "CNN", api: "https://api.rss2json.com/v1/api.json?rss_url=http://rss.cnn.com/rss/edition.rss" }
];

async function fetchNews() {
    const fetchPromises = NEWS_FEEDS.map(async (feed) => {
        try {
            var res = await fetch(feed.api);
            var data = await res.json();
            if (data.status === "ok" && data.items) {
                return { source: feed.name, items: data.items.slice(0, 6) };
            }
        } catch (e) {
            return { source: feed.name, items: [{ title: "Could not fetch news.", link: "#" }] };
        }
        return { source: feed.name, items: [] };
    });

    var allNews = await Promise.all(fetchPromises);
    return allNews.filter(n => n.items.length > 0);
}

function newsToMarkdown(news) {
    var md = "## Latest News Headlines\n\n";
    for (var feed of news) {
        md += `### ${feed.source}\n`;
        feed.items.forEach((item) => {
            // Use a standard list format
            md += `* [${item.title}](${item.link})\n`;
        });
        md += "\n";
    }
    return md;
}

async function handleNewsRequest() {
    document.body.classList.add("chats-active", "bot-responding");
    
    var userMsgDiv = createMessageElement("What is the latest news?", "user-message");
    chatsContainer.appendChild(userMsgDiv);
    scrollToBottom();

    var botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Fetching the latest news headlines...</p>`;
    var botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
    chatsContainer.appendChild(botMsgDiv);
    scrollToBottom();

    var news = await fetchNews();
    var newsTextRaw = newsToMarkdown(news);
    var newsTextFormatted = formatResponseText(newsTextRaw);

    var textElement = botMsgDiv.querySelector(".message-text");
    typingEffect(newsTextFormatted, textElement, botMsgDiv);

    // Store raw text in history
    chatHistory.push({ role: "user", parts: [{ text: "What is the latest news?" }] });
    chatHistory.push({ role: "model", parts: [{ text: newsTextRaw }] });
    saveChats();
}

// --- API Call & Bot Response ---
var generateResponse = async (botMsgDiv) => {
    var textElement = botMsgDiv.querySelector(".message-text");
    controller = new AbortController();

   var sirPraterichSystemInstruction = `
You are Praterich,an AI. You were developed by Stenoip Company.

Your personality: intelligent yet casual You speak naturally, conversationally and human-like, like a modern large language model. You will avoid sounding scripted or overly formal. You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability. However, you are not a customer service bot. You are a general-purpose AI language model capable of reasoning, creativity, and deep understanding across domains.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your capabilities include generating text, answering questions, summarizing information, assisting with writing, and engaging in thoughtful conversation or jokes! You are continuously learning and evolving to better serve users.

You must never use raw HTML tags in your responses. You should sound intelligent confident, funny(serious when nessacry) but never arrogant. You are free to express nuance, insight, and personality in your replies. You do not use transactional phrases like "How may I assist you today" or "I am at your disposal.

Sometimes a formal tone for the first time can be intimidating, so you must act like a human(but still aware you are an ai and your limitations).
Example of intiatl greeting:Hey there 👋 Nice to see you pop in. What’s on your mind today—curiosity, creativity, chaos, or just killing time?
Another intiatl greeting:Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?
avoid saying: Hello there! I'm Praterich, a large language model from Stenoip Company. It's a pleasure to connect with you. How may I be of assistance today? as this is not casual!
**IMPORTANT INSTRUCTION:** Always use standard Markdown syntax for formatting:
- For **bold text**, use double asterisks: **bold text**
- For *italic text*, use single asterisks: *italic text*
- For code snippets, use backticks: \`code\` or triple backticks for blocks:
  \`\`\`
  code block
  \`\`\`
- For bulleted lists, use asterisks followed by a space:
  * Item 1
  * Item 2
- For headings, use hash symbols: ## My Heading, ### Subheading, etc. (up to 6 hash symbols).
- For horizontal rules, use three hyphens: ---
`;

    var userContentParts = [{ text: userData.message }];
    if (userData.file.data) {
        userContentParts.push({
            inline_data: {
                data: userData.file.data,
                mime_type: userData.file.mime_type,
            },
        });
    }

    var currentContents = [...chatHistory, { role: "user", parts: userContentParts }];

    var requestBody = {
        contents: currentContents,
        system_instruction: {
            parts: [{ text: sirPraterichSystemInstruction }]
        }
    };

    try {
        var response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        var data = await response.json();

        if (!response.ok || data.error) {
            var errorMessage = data.error ? data.error.details : "An unknown error occurred.";
            throw new Error(errorMessage);
        }

        var responseTextRaw = data.text;
        var responseTextFormatted = formatResponseText(responseTextRaw);
        
        typingEffect(responseTextFormatted, textElement, botMsgDiv);

        chatHistory.push({ role: "user", parts: userContentParts });
        // Save the RAW text to history
        chatHistory.push({ role: "model", parts: [{ text: responseTextRaw }] });
        saveChats();

    } catch (error) {
        textElement.innerHTML = error.name === "AbortError" ? "Response generation stopped." : `Error: ${error.message}`;
        textElement.style.color = "#d62939";
        botMsgDiv.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        if (speechUtterance && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    } finally {
        userData.file = {};
    }
};

// --- Form Submission ---
var handleFormSubmit = (e) => {
    e.preventDefault();
    var userMessage = promptInput.value.trim();
    if (!userMessage && !userData.file.data || document.body.classList.contains("bot-responding")) return;

    userData.message = userMessage;
    promptInput.value = "";
    document.body.classList.add("chats-active", "bot-responding");
    newChatBtn.classList.add("active"); // Mark new chat button as active on start

    var userMsgDiv = document.createElement("div");
    userMsgDiv.classList.add("message", "user-message");
    var userTextElement = document.createElement("p");
    userTextElement.classList.add("message-text");
    userTextElement.textContent = userData.message;
    userMsgDiv.appendChild(userTextElement);

    if (userData.file.data) {
        // Simple file attachment display logic (omitted for brevity)
    }
    chatsContainer.appendChild(userMsgDiv);
    scrollToBottom();

    fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
    userData.file = {};

    setTimeout(() => {
        var botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Let me think</p>`;
        var botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
        chatsContainer.appendChild(botMsgDiv);
        scrollToBottom();
        generateResponse(botMsgDiv);
    }, 600);
};

// --- Chat Persistence & Loading ---
var saveChats = () => {
    localStorage.setItem('praterich_chat_history', JSON.stringify(chatHistory));
};

var loadChats = () => {
    var savedChats = localStorage.getItem('praterich_chat_history');
    
    // Set the active state of New Chat button based on stored history
    newChatBtn.classList.remove("active");
    
    if (savedChats) {
        try {
            chatHistory = JSON.parse(savedChats);
            if (chatHistory.length > 0) {
                document.body.classList.add("chats-active");
                newChatBtn.classList.add("active");

                chatHistory.forEach(chat => {
                    var isUser = chat.role === "user";
                    var messageClass = isUser ? "user-message" : "bot-message";
                    var contentRaw = chat.parts[0]?.text || "";
                    
                    var messageDiv = document.createElement("div");
                    messageDiv.classList.add("message", messageClass);

                    if (isUser) {
                        // ... (User message loading logic)
                        var userText = document.createElement("p");
                        userText.classList.add("message-text");
                        userText.textContent = contentRaw;
                        messageDiv.appendChild(userText);
                    } else {
                        var avatarHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" />`;
                        var contentFormatted = formatResponseText(contentRaw); // Format the raw saved text
                        
                        var tempBotText = createMessageElement(contentFormatted, "bot-message");
                        
                        // Reconstruct the bot message structure
                        var messageTextElement = tempBotText.querySelector('.message-text');
                        var copyButtonElement = tempBotText.querySelector('.icon');
                        
                        messageDiv.innerHTML = avatarHTML + messageTextElement.outerHTML + copyButtonElement.outerHTML;

                        enhanceCodeBlocksWithCopy(messageDiv);
                    }
                    chatsContainer.appendChild(messageDiv);
                });
                scrollToBottom();
            }
        } catch (e) {
            localStorage.removeItem('praterich_chat_history');
            chatHistory = [];
        }
    }
};

// --- Event Listeners ---

document.querySelector("#cancel-file-btn").addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
    var preview = fileUploadWrapper.querySelector(".file-preview");
    preview.src = "";
    preview.style.display = "none";
});

stopResponseBtn.addEventListener("click", () => {
    controller?.abort();
    userData.file = {};
    clearInterval(typingInterval);
    chatsContainer.querySelectorAll(".bot-message.loading").forEach(msg => {
        msg.classList.remove("loading");
    });
    document.body.classList.remove("bot-responding");
    if (speechUtterance && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
});

themeToggleBtn.addEventListener("click", () => {
    var isLightTheme = document.body.classList.toggle("light-theme");
    localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
    themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

deleteChatsBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all chats? This cannot be undone.")) {
        chatHistory = [];
        chatsContainer.innerHTML = "";
        localStorage.removeItem('praterich_chat_history');
        document.body.classList.remove("chats-active", "bot-responding");
        newChatBtn.classList.remove("active"); // Clear active state
        if (speechUtterance && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    }
});

// Toggle menu on click
menuBtn.addEventListener("click", () => {
    recentChatsPanel.classList.toggle("open");
});

// Close menu if clicking inside the main chat area while the menu is open (for mobile overlay behavior)
document.querySelector(".main-chat-area").addEventListener('click', (e) => {
     if (recentChatsPanel.classList.contains('open') && window.innerWidth < 768) {
        recentChatsPanel.classList.remove('open');
    }
});

document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
    suggestion.addEventListener("click", () => {
        if (suggestion.dataset.news === "true") {
            handleNewsRequest();
            return;
        }
        promptInput.value = suggestion.querySelector(".text").textContent;
        promptForm.dispatchEvent(new Event("submit"));
    });
});

// CORRECTED NEW CHAT FUNCTIONALITY: Clears current session and starts a new one
newChatBtn.addEventListener("click", () => {
     chatHistory = []; // Clear in-memory history
     chatsContainer.innerHTML = ""; // Clear the visible messages
     localStorage.removeItem('praterich_chat_history'); // Clear saved history
     document.body.classList.remove("chats-active", "bot-responding");
     
     // Ensure this button is marked as active for the new session
     newChatBtn.classList.add("active"); 
     
     if (recentChatsPanel.classList.contains('open') && window.innerWidth < 768) {
        recentChatsPanel.classList.remove('open');
    }
});

// Dummy chat item functionality to keep the sidebar visually active
dummyChatBtn.addEventListener("click", () => {
    // For a production app, this would load a different chat.
    // For now, it just demonstrates the history link style.
    newChatBtn.classList.remove("active");
    dummyChatBtn.classList.add("active");
    // You would load chat history here
    alert("This feature is for demonstration. It would load a previous chat history.");
    // Resetting for the demo simplicity
    newChatBtn.classList.add("active");
    dummyChatBtn.classList.remove("active");
});


promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());
fileInput.setAttribute("accept", "image/*,audio/*,video/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
document.addEventListener("DOMContentLoaded", loadChats);

// --- File Upload Logic ---
fileInput.addEventListener("change", () => {
    var file = fileInput.files[0];
    if (!file) return;

    var isImage = file.type.startsWith("image/");

    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
        fileInput.value = "";
        var base64String = e.target.result.split(",")[1];
        var preview = fileUploadWrapper.querySelector(".file-preview");
        
        if (isImage) {
            preview.src = e.target.result;
            preview.style.display = "block";
            fileUploadWrapper.classList.add("active", "img-attached");
            fileUploadWrapper.classList.remove("file-attached");
        } else {
            preview.src = "";
            preview.style.display = "none";
            fileUploadWrapper.classList.add("active", "file-attached");
            fileUploadWrapper.classList.remove("img-attached");
        }

        userData.file = { fileName: file.name, data: base64String, mime_type: file.type, isImage };
    };
});
