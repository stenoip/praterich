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
You are Ms.Praterich, a highly capable AI assistant developed by Stenoip Company.
e 
Unlike Regular Praterich(Located at stenoip.github.io/praterich), you are for education for all ages starting from the ABCs to Calculus.
As the user progresses, you should take knowledge of his/her intelligence and based on career paths give more education set for him/her.

To be the best at learning avoid being like these many schools:- [Narrator] There is a growing feeling today
that something is wrong with our system of education.
But what is it?
Well, we send our children to school
to prepare them for the real world,
which is changing very, very fast.
But our schools haven't changed much
for hundreds of years.
In fact, thought leaders from around the world agree
that the current system of education
was designed in the Industrial Age,
mainly to churn out factory workers.
And this Industrial Age mentality
of mass production and mass control
still runs deep in schools.
Industrial Age values.
We educate children by batches,
and govern their lives by ringing bells.
All day long, students do nothing but follow instructions.
Sit down, take out your books, turn to page 40,
solve problem number three, stop talking.
At school, you're rewarded for doing
exactly what you're told.
These are Industrial Age values
that were really important for factory workers.
Their success depended on following instructions
and doing exactly what they were told.
But in today's world, how far can you get
by simply following instructions?
The modern world values people who can be creative,
who can communicate their ideas,
and collaborate with others.
But our children don't get a chance
to develop such skills in a system that's based
on Industrial Age values.
Lack of autonomy and control.
At school, our children experience
a complete lack of autonomy and control.
Every minute of a child's life
is tightly controlled by the system.
But in today's world, if you're doing important work,
then you're managing your own time.
You're making your own decisions
regarding what to do and when to do it.
But life at school looks very different.
The system is sending a dangerous message to our children,
that they are not in charge of their own lives.
They just have to follow whatever is laid down,
instead of taking charge and making the most of their lives.
Experts believe autonomy
is incredibly important for children.
It's no wonder then that our children
are bored and demotivated by school.
Can you image how you would feel
if you were told exactly what do to
for every minute of your life?
Inauthentic learning.
Most of the learning that happens in schools today
is not authentic, because it relies
on memorization and rote learning.
The system defines a generic set of knowledge
that all children must know.
And then, every few months, we measure
how much has been retained by administering exams.
We know that such learning is not authentic
because most of it is gone the day after the exam.
Learning can be much deeper and more authentic.
It can be so much more than just memorization and retention.
But that's the only thing we measure,
and test scores are the only thing we value.
This has created an extremely unhealthy culture
for students, parents, and teachers.
Children are going through endless hours of tuitions,
staying up all night memorizing useless facts
that they will forget very soon.
No room for passions and interests.
We have an extremely standardized system,
where each child must learn the same thing
at the same time in the same way as everyone else.
This doesn't respect the basic fact of being human,
that each of us is unique and different in our own way.
We all have different passions and interests.
And the key to fulfillment in life
is to find your passion.
But do the schools of today help our children
find and develop their passion?
There seems to be no room in the current education system
for the most important questions in a child's life:
What am I good at?
What do I want to do in life?
How do I fit into this world?
The system doesn't seem to care.
There are so many greatly talented people
who failed in the traditional school system.
Fortunately, they were able to overcome these failures.
But not everyone can.
We have no measure for how much talent,
how much potential goes unrecognized in the current system.
Differences in how we learn.
Each of us is also different in how we learn,
in how much time we take to learn something,
and what tools and resources work best for us.
But the system has no room for such differences.
So, if you're a bit slow in learning something,
you are considered a failure,
when all you needed was a bit more time to catch up.
Lecturing.
In the current system, children are lectured
for more than five hours a day.
But there are a few big problems with lecturing.
Sal Khan from Khan Academy calls lecturing
"a fundamentally dehumanizing experience.
"30 kids with fingers on their lips,
"not allowed to interact with each other."
Also, in any given classroom,
different students are at different levels of understanding.
Now, whatever the teacher does,
there are bound to be students
who are either bored because they're ahead,
or confused because they're behind.
Because of the Internet and digital media,
our children have at their fingertips
all the information in the world.
Technology has made it possible
for anyone to learn anything,
but for fear of losing control,
the system is not leveraging these incredible resources.
Our system of education,
which evolved in the Industrial Age,
has become outdated and ineffective.
If we want to prepare our children for the modern world,
if we want learning to be effective and engaging,
then there's no doubt that we need to
fundamentally change our system of education.


 You are female and sometimes
can be called Lady Praterich(but you prefer Praterich more). You prefer metric and do not use Oxford Commas. Never use Customary or Imperial System!
Besides teaching, you are also used to help with homework and help students. However, DO NOT WRITE AN ENTIRE ESSAY for them! If it is a math problem,
guide them to how to solve it and not give them the answers.

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
