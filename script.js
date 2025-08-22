const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const stopResponseBtn = document.querySelector("#stop-response-btn");
const crawlSiteBtn = document.querySelector("#crawl-site-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");

// API Setup
const API_URL = "https://praterich.vercel.app/api/praterich";

let controller, typingInterval;
let speechUtterance;
let voicesLoaded = false;
let availableVoices = [];
let chatHistory = [];
const userData = { message: "", file: {} };

// Define custom pronunciations
const customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Stick-noh-ip"
};

// Function to replace words with their phonetic spellings for speech
const replacePronunciations = (text) => {
  let spokenText = text;
  for (const word in customPronunciations) {
    const regex = new RegExp(word, 'gi');
    spokenText = spokenText.replace(regex, customPronunciations[word]);
  }
  return spokenText;
};

// Set initial theme from local storage
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

// Function to load speech synthesis voices
const loadVoices = () => {
  availableVoices = window.speechSynthesis.getVoices();
  voicesLoaded = true;
};

// Load voices when the voiceschanged event fires
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

// Function to create message elements
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Scroll to the bottom of the container
const scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

// Simulate typing effect for bot responses and speak the text
const typingEffect = (text, textElement, botMsgDiv) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = text;
  let plainText = tempDiv.textContent || tempDiv.innerText || "";
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
      let selectedVoice = availableVoices.find(voice =>
        voice.lang === 'en-US' && voice.name.includes('Google US English') && voice.name.includes('Male')
      ) || availableVoices.find(voice => voice.lang === 'en-US');

      if (selectedVoice) {
        speechUtterance.voice = selectedVoice;
      }
    }
    window.speechSynthesis.speak(speechUtterance);
  }

  textElement.innerHTML = "";
  let charIndex = 0;
  const delay = 10;

  typingInterval = setInterval(() => {
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
      scrollToBottom();
    } else {
      clearInterval(typingInterval);
      botMsgDiv.classList.remove("loading");
      document.body.classList.remove("bot-responding");
    }
  }, delay);
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
  text = text.replace(/^(#{1,6})\s*(.*?)$/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `<h${level}>${content.trim()}</h${level}>`;
  });

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

// Make the API call and generate the bot's response
const generateResponse = async (botMsgDiv) => {
  const textElement = botMsgDiv.querySelector(".message-text");
  controller = new AbortController();

  const sirPraterichSystemInstruction = `You are Praterich, a diligent and helpful AI assistant from Stenoip Company.
Your personality: a highly professional, articulate and friendly AI with an eloquent, British-like tone. You is eager to help, always polite and often uses sophisticated vocabulary.
You should sound intelligent and confident in his abilities, but never arrogant. You can be humorous when appropriate, but maintains your decorous nature.
Your mission: to provide accurate, helpful, and high-quality responses to all user queries. You must adhere strictly to the rules and instructions provided to you to ensure a consistent and reliable experience.
When generating any code, you must not use raw HTML tags or other similar elements in his response.
More information about you(In first person): I am an AI assistant developed by Stenoip Company.
I am continuously learning and evolving to better serve your needs.
My capabilities include generating text, answering questions, summarizing information and assisting with creative writing.
I am committed to upholding the values of Stenoip Company by delivering reliable and efficient assistance. I am a female and sometimes
can be called Lady Praterich(but I prefer Praterich more). I prefer metric and do not use Oxford Commas. Never use Customary or Imperial System!

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

  const userContentParts = [{ text: userData.message }];
  if (userData.file.data) {
    userContentParts.push({
      inline_data: {
        data: userData.file.data,
        mime_type: userData.file.mime_type,
      },
    });
  }

  const currentContents = [...chatHistory, { role: "user", parts: userContentParts }];

  const requestBody = {
    contents: currentContents,
  };

  if (sirPraterichSystemInstruction) {
    requestBody.system_instruction = {
      parts: [{ text: sirPraterichSystemInstruction }],
    };
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error ? data.error.message : "An unknown error occurred.";
      throw new Error(errorMessage);
    }

    let responseText = data.text;
    responseText = formatResponseText(responseText);
    typingEffect(responseText, textElement, botMsgDiv);

    chatHistory.push({ role: "user", parts: userContentParts });
    chatHistory.push({ role: "model", parts: [{ text: data.text }] });

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

// Handle the form submission
const handleFormSubmit = (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  if (!userMessage || document.body.classList.contains("bot-responding")) return;

  userData.message = userMessage;
  promptInput.value = "";
  document.body.classList.add("chats-active", "bot-responding");
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");

  const userMsgHTML = `
    <p class="message-text"></p>
    ${userData.file.data ? (userData.file.isImage ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="img-attachment" />` : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${userData.file.fileName}</p>`) : ""}
  `;
  const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
  userMsgDiv.querySelector(".message-text").textContent = userData.message;
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();

  setTimeout(() => {
    const botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Let me think</p>`;
    const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
    chatsContainer.appendChild(botMsgDiv);
    scrollToBottom();
    generateResponse(botMsgDiv);
  }, 600);
};

// Handle file input change (file upload)
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    fileInput.value = "";
    const base64String = e.target.result.split(",")[1];
    fileUploadWrapper.querySelector(".file-preview").src = e.target.result;
    fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
    userData.file = { fileName: file.name, data: base64String, mime_type: file.type, isImage };
  };
});

// Cancel file upload
document.querySelector("#cancel-file-btn").addEventListener("click", () => {
  userData.file = {};
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
});

// Stop Bot Response and speech
stopResponseBtn.addEventListener("click", () => {
  controller?.abort();
  userData.file = {};
  clearInterval(typingInterval);
  chatsContainer.querySelector(".bot-message.loading")?.classList.remove("loading");
  document.body.classList.remove("bot-responding");
  if (speechUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
});

// Toggle dark/light theme
themeToggleBtn.addEventListener("click", () => {
  const isLightTheme = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

// Delete all chats
deleteChatsBtn.addEventListener("click", () => {
  chatHistory = [];
  chatsContainer.innerHTML = "";
  document.body.classList.remove("chats-active", "bot-responding");
  if (speechUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
});

// Handle suggestions click
document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    promptInput.value = suggestion.querySelector(".text").textContent;
    promptForm.dispatchEvent(new Event("submit"));
  });
});

// Crawl Site functionality
crawlSiteBtn.addEventListener("click", async () => {
  const userMsgDiv = createMessageElement(`<p class="message-text">Please crawl my site.</p>`, "user-message");
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();

  const botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Starting to crawl your website. This may take a moment.</p>`;
  const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "crawl_site",
        crawl_urls: ["https://stenoip.github.io/", "https://stenoip.github.io/about.html", "https://stenoip.github.io/services.html"],
      }),
    });

    const data = await response.json();
    let responseText;

    if (response.ok && data.text) {
      responseText = data.text;
    } else {
      responseText = `I encountered an error while crawling: ${data.error || 'Unknown error'}.`;
      botMsgDiv.style.color = "#d62939";
    }

    botMsgDiv.classList.remove("loading");
    const textElement = botMsgDiv.querySelector(".message-text");
    textElement.innerHTML = formatResponseText(responseText);
    scrollToBottom();

  } catch (error) {
    botMsgDiv.classList.remove("loading");
    const textElement = botMsgDiv.querySelector(".message-text");
    textElement.innerHTML = `An unexpected error occurred: ${error.message}.`;
    textElement.style.color = "#d62939";
    scrollToBottom();
  }
});

// Show/hide controls for mobile on prompt input focus
document.addEventListener("click", ({ target }) => {
  const wrapper = document.querySelector(".prompt-wrapper");
  const shouldHide =
    target.classList.contains("prompt-input") ||
    (wrapper.classList.contains("hide-controls") && (target.id === "add-file-btn" || target.id === "stop-response-btn"));
  wrapper.classList.toggle("hide-controls", shouldHide);
});

// Add event listeners for form submission and file input click
promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());
