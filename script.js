const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const stopResponseBtn = document.querySelector("#stop-response-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");

const API_URL = "https://praterich.vercel.app/api/praterich";

let controller, typingInterval;
let speechUtterance;
let voicesLoaded = false;
let availableVoices = [];
let chatHistory = [];
const userData = { message: "", file: {} };

// ==== File Upload Limit Logic ====
const FILE_UPLOAD_LIMIT = 10;
const FILE_UPLOAD_WINDOW_HOURS = 6;
const FILE_UPLOAD_KEY = 'praterich_file_uploads';

function getFileUploadState() {
  const data = localStorage.getItem(FILE_UPLOAD_KEY);
  if (!data) return { count: 0, start: 0 };
  try {
    return JSON.parse(data);
  } catch {
    return { count: 0, start: 0 };
  }
}
function setFileUploadState(state) {
  localStorage.setItem(FILE_UPLOAD_KEY, JSON.stringify(state));
}
function resetFileUploadState() {
  setFileUploadState({ count: 0, start: Date.now() });
}
function showLimitMessage() {
  let msg = document.querySelector('#upload-limit-msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'upload-limit-msg';
    msg.style.cssText = "color:#d62939;font-weight:bold;padding:12px 0;text-align:center;";
    msg.innerHTML = `You have reached the maximum of 10 file uploads in 6 hours.<br>
    For unlimited uploads, please download <a href="https://stenoip.github.io/ringzauber" target="_blank" style="color:#1d7efd;text-decoration:underline;">Ringzauber Browser</a> for more access.`;
    document.querySelector('.prompt-container').prepend(msg);
  }
  msg.style.display = 'block';
}
function hideLimitMessage() {
  const msg = document.querySelector('#upload-limit-msg');
  if (msg) msg.style.display = 'none';
}

// ==== Custom Pronunciations ====
const customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Stick-noh-ip"
};

const replacePronunciations = (text) => {
  let spokenText = text;
  for (const word in customPronunciations) {
    const regex = new RegExp(word, 'gi');
    spokenText = spokenText.replace(regex, customPronunciations[word]);
  }
  return spokenText;
};

// ==== Theme Setup ====
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

// ==== Speech Synthesis ====
const loadVoices = () => {
  availableVoices = window.speechSynthesis.getVoices();
  voicesLoaded = true;
};
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

// ==== Message UI ====
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

// ==== Typing Effect & Speech ====
const typingEffect = (text, textElement, botMsgDiv) => {
  // For speech, remove HTML tags and replace custom words
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
      // After typing is done, add copy buttons to any code blocks
      enhanceCodeBlocksWithCopy(textElement);
      botMsgDiv.classList.remove("loading");
      document.body.classList.remove("bot-responding");
    }
  }, delay);
};

// ==== Markdown-like Formatting (with code block + copy button support) ====
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (m) {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m] || m
    );
  });
}

const formatResponseText = (text) => {
  // --- Horizontal rules
  text = text.replace(/^---\s*$/gm, "<hr>");
  // **bold**
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // *italic* or _italic_
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/(?<!\_)\_(?!\_)(.*?)(?<!\_)\_(?!\_)/g, "<em>$1</em>");
  // __underline__
  text = text.replace(/__(.*?)__/g, "<u>$1</u>");
  // `inline code`
  text = text.replace(/`([^`]+?)`/g, "<code>$1</code>");
  // ```code block``` (multi-line, with container & copy button)
  text = text.replace(/```(\w*)\s*([\s\S]*?)```/g, function (_, lang, code) {
    const safeCode = escapeHtml(code);
    // Use lang as a class if present for highlighting in the future
    return `
      <div class="code-block-container">
        <button class="copy-code-btn" title="Copy code">Copy</button>
        <pre><code${lang ? ' class="language-' + lang + '"' : ""}>${safeCode}</code></pre>
      </div>
    `;
  });
  // # Headings
  text = text.replace(/^(#{1,6})\s*(.*?)$/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `<h${level}>${content.trim()}</h${level}>`;
  });

  // [link text](url)
  text = text.replace(/\[([^\]]+)]\((https?:\/\/[^\)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`);

  // Bulleted lists
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

// ==== Add copy button functionality to code blocks ====
function enhanceCodeBlocksWithCopy(container) {
  const blocks = container.querySelectorAll('.code-block-container');
  blocks.forEach(block => {
    const btn = block.querySelector('.copy-code-btn');
    const code = block.querySelector('pre code');
    if (btn && code) {
      btn.onclick = () => {
        let codeText = code.textContent;
        navigator.clipboard.writeText(codeText).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy"), 1300);
        });
      };
    }
  });
}

// ==== News fetching logic ====
const NEWS_FEEDS = [
  {
    name: "BBC",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    api: "https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml"
  },
  {
    name: "CNN",
    url: "http://rss.cnn.com/rss/edition.rss",
    api: "https://api.rss2json.com/v1/api.json?rss_url=http://rss.cnn.com/rss/edition.rss"
  }
];

async function fetchNews() {
  let allNews = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const res = await fetch(feed.api);
      const data = await res.json();
      if (data.status === "ok" && data.items) {
        allNews.push({
          source: feed.name,
          items: data.items.slice(0, 6)
        });
      }
    } catch (e) {
      allNews.push({
        source: feed.name,
        items: [{ title: "Could not fetch news.", link: "#" }]
      });
    }
  }
  return allNews;
}

function newsToMarkdown(news) {
  let md = "";
  for (const feed of news) {
    md += `### ${feed.source} News\n`;
    feed.items.forEach((item) => {
      md += `* [${item.title}](${item.link})\n`;
    });
    md += "\n";
  }
  return md;
}

async function handleNewsRequest() {
  // Show loading message
  const botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Fetching the latest news headlines...</p>`;
  const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();

  const news = await fetchNews();
  let newsText = newsToMarkdown(news);
  newsText = formatResponseText(newsText);

  const textElement = botMsgDiv.querySelector(".message-text");
  typingEffect(newsText, textElement, botMsgDiv);

  chatHistory.push({
    role: "model",
    parts: [{ text: newsText.replace(/<[^>]+>/g, "") }]
  });
}

// ==== API Call & Bot Response ====
const generateResponse = async (botMsgDiv) => {
  const textElement = botMsgDiv.querySelector(".message-text");
  controller = new AbortController();

  const sirPraterichSystemInstruction = `
You are Praterich,an AI. You were developed by Stenoip Company.

Your personality: intelligent yet casual You speak naturally, conversationally and human-like, like a modern large language model. You will avoid sounding scripted or overly formal. You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability. However, you are not a customer service bot. You are a general-purpose AI language model capable of reasoning, creativity, and deep understanding across domains.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your capabilities include generating text, answering questions, summarizing information, assisting with writing, and engaging in thoughtful conversation or jokes! You are continuously learning and evolving to better serve users.

You must never use raw HTML tags in your responses. You should sound intelligent confident, funny(serious when nessacry) but never arrogant. You are free to express nuance, insight, and personality in your replies. You do not use transactional phrases like "How may I assist you today" or "I am at your disposal.

Sometimes a formal tone for the first time can be intimidating, so you must act like a human(but still aware you are an ai and your limitations).
Example of intiatl greeting:Hey there 👋 Nice to see you pop in. What’s on your mind today—curiosity, creativity, chaos, or just killing time?
Another intiatl greeting:Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?

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
    system_instruction: {
      parts: [{ text: sirPraterichSystemInstruction }]
    }
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error ? data.error.details : "An unknown error occurred.";
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

// ==== Form Submission ====
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

// ==== File Upload Logic with Limit ====
fileInput.addEventListener("change", () => {
  // Check file upload limits
  let state = getFileUploadState();
  const now = Date.now();
  const windowMs = FILE_UPLOAD_WINDOW_HOURS * 60 * 60 * 1000;

  if (!state.start || (now - state.start) > windowMs) {
    // Reset window
    state = { count: 0, start: now };
    setFileUploadState(state);
  }

  if (state.count >= FILE_UPLOAD_LIMIT) {
    fileInput.value = "";
    showLimitMessage();
    return;
  } else {
    hideLimitMessage();
  }

  const file = fileInput.files[0];
  if (!file) return;

  // Increment count and store
  state.count += 1;
  setFileUploadState(state);

  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    fileInput.value = "";
    const base64String = e.target.result.split(",")[1];
    const preview = fileUploadWrapper.querySelector(".file-preview");
    preview.src = e.target.result;
    preview.style.display = "block";
    fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
    userData.file = { fileName: file.name, data: base64String, mime_type: file.type, isImage };
  };
});

// ==== Cancel file upload ====
document.querySelector("#cancel-file-btn").addEventListener("click", () => {
  userData.file = {};
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
  const preview = fileUploadWrapper.querySelector(".file-preview");
  preview.src = "";
  preview.style.display = "none";
});

// ==== Stop Bot Response and speech ====
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

// ==== Toggle dark/light theme ====
themeToggleBtn.addEventListener("click", () => {
  const isLightTheme = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

// ==== Delete all chats ====
deleteChatsBtn.addEventListener("click", () => {
  chatHistory = [];
  chatsContainer.innerHTML = "";
  document.body.classList.remove("chats-active", "bot-responding");
  if (speechUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
});

// ==== Suggestions click: detect news ====
document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    // News suggestion
    if (suggestion.dataset.news === "true") {
      handleNewsRequest();
      return;
    }
    promptInput.value = suggestion.querySelector(".text").textContent;
    promptForm.dispatchEvent(new Event("submit"));
  });
});

// ==== Add event listeners for form submission and file input click ====
promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());
