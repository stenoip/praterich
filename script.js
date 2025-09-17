var container = document.querySelector(".container");
var chatsContainer = document.querySelector(".chats-container");
var promptForm = document.querySelector(".prompt-form");
var promptInput = promptForm.querySelector(".prompt-input");
var fileInput = promptForm.querySelector("#file-input");
var fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
var themeToggleBtn = document.querySelector("#theme-toggle-btn");
var stopResponseBtn = document.querySelector("#stop-response-btn");
var deleteChatsBtn = document.querySelector("#delete-chats-btn");

var API_URL = "https://praterich.vercel.app/api/praterich";

var controller, typingInterval;
var speechUtterance;
var voicesLoaded = false;
var availableVoices = [];
var chatHistory = [];
var userData = { message: "", file: {} };

// ==== Custom Pronunciations ====
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

// ==== Theme Setup ====
var isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

// ==== Speech Synthesis ====
var loadVoices = () => {
  availableVoices = window.speechSynthesis.getVoices();
  voicesLoaded = true;
};
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

// ==== Message UI ====
var createMessageElement = (content, ...classes) => {
  var div = document.createElement("div");
  div.classList.add("message", ...classes);
  
  if (!classes.includes("loading")) {
    var copyButtonHTML = `<span onclick="copyMessage(this)" class="icon material-symbols-rounded">content_copy</span>`;
    div.innerHTML = content + copyButtonHTML;
  } else {
    div.innerHTML = content;
  }
  
  return div;
};

var scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

// ==== Copy Message Functionality ====
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

// ==== Typing Effect & Speech ====
var typingEffect = (text, textElement, botMsgDiv) => {
  // For speech, remove HTML tags and replace custom words
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
      enhanceCodeBlocksWithCopy(textElement);
      botMsgDiv.classList.remove("loading");
      document.body.classList.remove("bot-responding");
      saveChats();
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

var formatResponseText = (text) => {
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
    var safeCode = escapeHtml(code);
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
    var level = hashes.length;
    return `<h${level}>${content.trim()}</h${level}>`;
  });

  // [link text](url)
  text = text.replace(/\[([^\]]+)]\((https?:\/\/[^\)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`);

  // Bulleted lists
  var listItems = [];
  var lines = text.split('\n');
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
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

// ==== News fetching logic ====
var NEWS_FEEDS = [
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
  var allNews = [];
  for (var feed of NEWS_FEEDS) {
    try {
      var res = await fetch(feed.api);
      var data = await res.json();
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
  var md = "";
  for (var feed of news) {
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
  var botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Fetching the latest news headlines...</p>`;
  var botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();

  var news = await fetchNews();
  var newsText = newsToMarkdown(news);
  newsText = formatResponseText(newsText);

  var textElement = botMsgDiv.querySelector(".message-text");
  typingEffect(newsText, textElement, botMsgDiv);

  chatHistory.push({
    role: "model",
    parts: [{ text: newsText.replace(/<[^>]+>/g, "") }]
  });
}

// ==== API Call & Bot Response ====
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

    var responseText = data.text;
    responseText = formatResponseText(responseText);
    typingEffect(responseText, textElement, botMsgDiv);

    chatHistory.push({ role: "user", parts: userContentParts });
    chatHistory.push({ role: "model", parts: [{ text: data.text }] });
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

// ==== Form Submission ====
var handleFormSubmit = (e) => {
  e.preventDefault();
  var userMessage = promptInput.value.trim();
  if (!userMessage || document.body.classList.contains("bot-responding")) return;

  userData.message = userMessage;
  promptInput.value = "";
  document.body.classList.add("chats-active", "bot-responding");
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");

  var userMsgHTML = `
    <p class="message-text"></p>
    ${userData.file.data ? (userData.file.isImage ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="img-attachment" />` : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${userData.file.fileName}</p>`) : ""}
  `;
  var userMsgDiv = createMessageElement(userMsgHTML, "user-message");
  userMsgDiv.querySelector(".message-text").textContent = userData.message;
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();

  setTimeout(() => {
    var botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" /> <p class="message-text">Let me think</p>`;
    var botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
    chatsContainer.appendChild(botMsgDiv);
    scrollToBottom();
    generateResponse(botMsgDiv);
  }, 600);
};

// ==== Chat Persistence (Local Storage) ====
var saveChats = () => {
  localStorage.setItem('praterich_chat_history', JSON.stringify(chatHistory));
};

var loadChats = () => {
  var savedChats = localStorage.getItem('praterich_chat_history');
  if (savedChats) {
    try {
      chatHistory = JSON.parse(savedChats);
      if (chatHistory.length > 0) {
        document.body.classList.add("chats-active");
        chatHistory.forEach(chat => {
          var isUser = chat.role === "user";
          var messageClass = isUser ? "user-message" : "bot-message";
          var avatarHTML = isUser ? '' : `<img class="avatar" src="https://stenoip.github.io/praterich/ladypraterich.png" />`;
          var content = chat.parts[0]?.text || "";
          var formattedContent = isUser ? content : formatResponseText(content);
          var messageHTML = `${avatarHTML}<p class="message-text">${formattedContent}</p>`;
          var messageDiv = createMessageElement(messageHTML, messageClass);
          chatsContainer.appendChild(messageDiv);
        });
        scrollToBottom();
      }
    } catch (e) {
      console.error("Failed to parse chat history from localStorage", e);
      localStorage.removeItem('praterich_chat_history');
      chatHistory = [];
    }
  }
};

// ==== File Upload Logic ====
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
  var preview = fileUploadWrapper.querySelector(".file-preview");
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
  var isLightTheme = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

// ==== Delete all chats ====
deleteChatsBtn.addEventListener("click", () => {
  chatHistory = [];
  chatsContainer.innerHTML = "";
  localStorage.removeItem('praterich_chat_history');
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

// Initial chat load
document.addEventListener("DOMContentLoaded", loadChats);
