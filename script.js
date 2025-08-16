const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

// API configuration
const API_URL = "https://praterich.vercel.app/api/praterich";

let controller, typingInterval;
let speechUtterance;
let voicesLoaded = false;
let availableVoices = [];
const chatHistory = [];
const userData = { message: "", file: {} };

// Load theme and chat data from local storage on page load
const loadDataFromLocalstorage = () => {
    const savedChats = localStorage.getItem("saved-chats");
    const isLightMode = localStorage.getItem("themeColor") === "light_mode";

    document.body.classList.toggle("light_mode", isLightMode);
    toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";

    chatContainer.innerHTML = savedChats || '';
    document.body.classList.toggle("hide-header", savedChats);

    chatContainer.scrollTo(0, chatContainer.scrollHeight);
};

// Function to create a message element
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};

// Function to process and format markdown-like text to HTML
const formatResponseText = (text) => {
    text = text.replace(/^---\s*$/gm, "<hr>");
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    text = text.replace(/(?<!\_)\_(?!\_)(.*?)(?<!\_)\_(?!\_)/g, "<em>$1</em>");
    text = text.replace(/__(.*?)__/g, "<u>$1</u>");
    text = text.replace(/`(.*?)`/g, "<code>$1</code>");
    text = text.replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>");
    text = text.replace(/^(#{1,6})\s*(.*?)$/gm, (match, hashes, content) => `<h${hashes.length}>${content.trim()}</h${hashes.length}>`);

    let listItems = [];
    const lines = text.split('\n');
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (/^\*\s*(.*)/.test(line.trim())) {
            if (!inList) {
                listItems.push('<ul>');
                inList = true;
            }
            listItems.push(`<li>${line.trim().substring(line.trim().indexOf('*') + 1).trim()}</li>`);
        } else {
            if (inList) {
                listItems.push('</ul>');
                inList = false;
            }
            listItems.push(line);
        }
    }
    if (inList) {
        listItems.push('</ul>');
    }
    text = listItems.join('\n');
    return text;
};

// Simulate typing effect
const showTypingEffect = (text, textElement, incomingMessageDiv) => {
    textElement.innerHTML = "";
    let charIndex = 0;
    const delay = 10;

    const typingInterval = setInterval(() => {
        if (charIndex < text.length) {
            let nextChar = text.charAt(charIndex);
            if (nextChar === '<') {
                const endIndex = text.indexOf('>', charIndex);
                if (endIndex !== -1) {
                    nextChar = text.substring(charIndex, endIndex + 1);
                    charIndex = endIndex;
                }
            }
            textElement.innerHTML += nextChar;
            charIndex++;
            chatContainer.scrollTo(0, chatContainer.scrollHeight);
        } else {
            clearInterval(typingInterval);
            isResponseGenerating = false;
            incomingMessageDiv.querySelector(".icon").classList.remove("hide");
            localStorage.setItem("saved-chats", chatContainer.innerHTML);
        }
    }, delay);
};

// Fetch response from the API based on user message
const generateAPIResponse = async (incomingMessageDiv) => {
    const textElement = incomingMessageDiv.querySelector(".text");
    
    const sirPraterichSystemInstruction = `You are Praterich, a diligent and helpful AI assistant from Stenoip Company. Your personality: a highly professional, articulate, and friendly AI with an eloquent, British-like tone. He is eager to help, always polite, and often uses sophisticated vocabulary. He should sound intelligent and confident in his abilities, but never arrogant. He can be humorous when appropriate, but maintains his decorous nature. Your mission: to provide accurate, helpful, and high-quality responses to all user queries. He must adhere strictly to the rules and instructions provided to him to ensure a consistent and reliable experience. When generating any code, he must wrap it exclusively in Markdown fenced code blocks (\`\`\` \`\`\`) and must not use raw HTML tags or other similar elements in his response. More information about you: He is an AI assistant developed by Stenoip Company.

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

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userMessage }] }],
                system_instruction: { parts: [{ text: sirPraterichSystemInstruction }] }
            }),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error ? data.error.message : "An unknown error occurred.");
        }

        let responseText = data.text;
        responseText = formatResponseText(responseText);
        showTypingEffect(responseText, textElement, incomingMessageDiv);
    } catch (error) {
        isResponseGenerating = false;
        textElement.innerText = error.message;
        textElement.parentElement.closest(".message").classList.add("error");
    } finally {
        incomingMessageDiv.classList.remove("loading");
    }
};

// Show a loading animation while waiting for the API response
const showLoadingAnimation = () => {
    const html = `<div class="message-content">
        <img class="avatar" src="https://stenoip.github.io/praterich_logo.png" alt="Sir Praterich Logo">
        <p class="text"></p>
        <div class="loading-indicator">
            <div class="loading-bar"></div>
            <div class="loading-bar"></div>
            <div class="loading-bar"></div>
        </div>
    </div>
    <span onClick="copyMessage(this)" class="icon material-symbols-rounded">content_copy</span>`;

    const incomingMessageDiv = createMessageElement(html, "incoming", "loading");
    chatContainer.appendChild(incomingMessageDiv);

    chatContainer.scrollTo(0, chatContainer.scrollHeight);
    generateAPIResponse(incomingMessageDiv);
};

// Copy message text to the clipboard
const copyMessage = (copyButton) => {
    const messageText = copyButton.parentElement.querySelector(".text").innerText;
    navigator.clipboard.writeText(messageText);
    copyButton.innerText = "done";
    setTimeout(() => copyButton.innerText = "content_copy", 1000);
};

// Handle sending outgoing chat messages
const handleOutgoingChat = () => {
    const userMessageInput = typingForm.querySelector(".typing-input");
    userMessage = userMessageInput.value.trim();
    if (!userMessage || isResponseGenerating) return;

    isResponseGenerating = true;

    const html = `<div class="message-content">
        <img class="avatar" src="https://stenoip.github.io/user_sirpraterich.png" alt="User avatar">
        <p class="text"></p>
    </div>`;

    const outgoingMessageDiv = createMessageElement(html, "outgoing");
    outgoingMessageDiv.querySelector(".text").innerText = userMessage;
    chatContainer.appendChild(outgoingMessageDiv);
    
    userMessageInput.value = "";
    document.body.classList.add("hide-header");
    chatContainer.scrollTo(0, chatContainer.scrollHeight);
    setTimeout(showLoadingAnimation, 500);
};

// Toggle between light and dark themes
toggleThemeButton.addEventListener("click", () => {
    const isLightMode = document.body.classList.toggle("light_mode");
    localStorage.setItem("themeColor", isLightMode ? "light_mode" : "dark_mode");
    toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
});

// Delete all chats from local storage when button is clicked
deleteChatButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all the chats?")) {
        localStorage.removeItem("saved-chats");
        loadDataFromLocalstorage();
    }
});

// Set userMessage and handle outgoing chat when a suggestion is clicked
suggestions.forEach(suggestion => {
    suggestion.addEventListener("click", () => {
        userMessage = suggestion.querySelector(".text").innerText;
        handleOutgoingChat();
    });
});

// Prevent default form submission and handle outgoing chat
typingForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleOutgoingChat();
});

loadDataFromLocalstorage();
