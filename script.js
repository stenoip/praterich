const container = document.querySelector(".container");
      const chatsContainer = document.querySelector(".chats-container");
      const promptForm = document.querySelector(".prompt-form");
      const promptInput = promptForm.querySelector(".prompt-input");
      const fileInput = promptForm.querySelector("#file-input");
      const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
      const themeToggleBtn = document.querySelector("#theme-toggle-btn");
      const stopResponseBtn = document.querySelector("#stop-response-btn"); // Get the stop button

      // API Setup
      const API_URL = "https://praterich.vercel.app/api/praterich";

      let controller, typingInterval;
      let speechUtterance; // Global variable to hold the SpeechSynthesisUtterance
      let voicesLoaded = false; // Flag to check if voices are loaded
      let availableVoices = []; // To store available voices

      // chatHistory now only stores user and model turns for context
      const chatHistory = [];
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
          // Use a regex with 'gi' flags for global and case-insensitive replacement
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
        // Also try to load them immediately if they are already available
        loadVoices();
      }

      // Function to create message elements
      const createMessageElement = (content, ...classes) => {
        const div = document.createElement("div");
        div.classList.add("message", ...classes);
        div.innerHTML = content; // Use innerHTML to render formatted text
        return div;
      };

      // Scroll to the bottom of the container
      const scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

      // Simulate typing effect for bot responses and speak the text
      const typingEffect = (text, textElement, botMsgDiv) => {
        // Create a temporary div to hold the HTML and extract plain text for speech
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        let plainText = tempDiv.textContent || tempDiv.innerText || "";
        plainText = replacePronunciations(plainText); // Apply phonetic replacements

        // Stop any ongoing speech before starting a new one
        if (speechUtterance && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }

        // Initialize and speak the full plain text
        if (window.speechSynthesis && plainText.length > 0) {
          speechUtterance = new SpeechSynthesisUtterance(plainText);
          speechUtterance.rate = 1.0; // Adjust speech rate
          speechUtterance.pitch = 1.0; // Adjust speech pitch
          speechUtterance.lang = 'en-US'; // Set language

          // Try to find a suitable voice (e.g., a male US English voice)
          if (voicesLoaded) {
            let selectedVoice = availableVoices.find(voice =>
              voice.lang === 'en-US' && voice.name.includes('Google US English') && voice.name.includes('Male')
            ) || availableVoices.find(voice => voice.lang === 'en-US'); // Fallback to any US English voice

            if (selectedVoice) {
              speechUtterance.voice = selectedVoice;
            }
          }
          window.speechSynthesis.speak(speechUtterance);
        }

        // Simulate typing the HTML content
        textElement.innerHTML = ""; // Clear previous content
        let charIndex = 0;
        const delay = 10; // Typing speed

        typingInterval = setInterval(() => {
            if (charIndex < text.length) {
                // Find the next character or full HTML tag
                let nextChar = text.charAt(charIndex);
                if (nextChar === '<') {
                    // If it's the start of a tag, find the end of the tag
                    const endIndex = text.indexOf('>', charIndex);
                    if (endIndex !== -1) {
                        nextChar = text.substring(charIndex, endIndex + 1);
                        charIndex = endIndex; // Move past the tag
                    }
                }
                textElement.innerHTML += nextChar;
                charIndex++;
                scrollToBottom();
            } else {
                clearInterval(typingInterval);
                botMsgDiv.classList.remove("loading");
                document.body.classList.remove("bot-responding");
                // Ensure speech stops when typing completes naturally
                if (speechUtterance && window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                }
            }
        }, delay);
      };

      // Function to process and format markdown-like text to HTML
      const formatResponseText = (text) => {
        // Replace occurrences of --- with <hr> for horizontal rules
        text = text.replace(/^---\s*$/gm, "<hr>");
        // Precautionary step: Escape any literal HTML tags that might still slip through from the AI
        text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // Convert **bold** to <strong>
        text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        // Convert *italics* or _italics_ to <em>
        text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>"); // Single asterisks
        text = text.replace(/(?<!\_)\_(?!\_)(.*?)(?<!\_)\_(?!\_)/g, "<em>$1</em>"); // Single underscores
        // Convert __underline__ to <u>
        text = text.replace(/__(.*?)__/g, "<u>$1</u>");
        // Convert `code` to <code>
        text = text.replace(/`(.*?)`/g, "<code>$1</code>");
        // Convert ```code_block``` to <pre><code>code_block</code></pre>
        // This handles multiline code blocks
        text = text.replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>"); // 's' flag for dotall (matches newlines)

        // Convert ## Heading to <h2>Heading</h2>
        // This regex captures one or more '#' followed by a space, then the heading text.
        // It's non-greedy (.*?) and matches until the end of the line or the string end.
        // The `gm` flags enable global and multiline matching.
        text = text.replace(/^(#{1,6})\s*(.*?)$/gm, (match, hashes, content) => {
            const level = hashes.length;
            return `<h${level}>${content.trim()}</h${level}>`;
        });

        // Convert bullet points (* Item) to <ul><li>
        // This is a bit trickier to ensure valid HTML lists.
        // We'll replace lines starting with * with <li> and then wrap consecutive <li>s in <ul>
        // This regex specifically targets lines that start with an asterisk and a space/tab.
        let listItems = [];
        const lines = text.split('\n');
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (/^\*\s*(.*)/.test(line.trim())) { // Check if line starts with a bullet point
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
        if (inList) { // Close the last ul if the text ends with a list
            listItems.push('</ul>');
        }
        text = listItems.join('\n'); // Rejoin lines

        return text;
      };


      // Make the API call and generate the bot's response
      const generateResponse = async (botMsgDiv) => {
        const textElement = botMsgDiv.querySelector(".message-text");
        controller = new AbortController();

        // Retrieve Sir Praterich's persona from the script tag
        const sirPraterichInfoElement = document.getElementById("sir-praterich-info");
        let sirPraterichSystemInstruction = "";
        if (sirPraterichInfoElement) {
          const sirPraterichData = JSON.parse(sirPraterichInfoElement.textContent);
          sirPraterichSystemInstruction = `You are Praterich, a diligent and helpful AI assistant from Stenoip Company. Your personality: ${sirPraterichData.personality}. Your mission: ${sirPraterichData.mission}. More information about you: ${sirPraterichData.more_info}.

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
        }

        // Prepare the user's content for the current turn
        const userContentParts = [{ text: userData.message }];
        if (userData.file.data) {
          userContentParts.push({
            inline_data: {
              data: userData.file.data,
              mime_type: userData.file.mime_type,
            },
          });
        }

        // Construct the full contents array, including history and the current user turn
        const currentContents = [...chatHistory, { role: "user", parts: userContentParts }];

        // Construct the request body for the API call
        const requestBody = {
          contents: currentContents,
        };

        // Add the system instruction if it exists (top-level parameter)
        if (sirPraterichSystemInstruction) {
          requestBody.system_instruction = {
            parts: [{ text: sirPraterichSystemInstruction }],
          };
        }

        try {
          // Send the request to the API
          const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody), // Send the constructed requestBody
            signal: controller.signal,
          });

          const data = await response.json();

          // Check for errors in the API response
          if (!response.ok || data.error) {
            const errorMessage = data.error ? data.error.message : "An unknown error occurred.";
            throw new Error(errorMessage);
          }

          // Process the response text
          let responseText = data.text;

          // Apply markdown formatting to HTML
          responseText = formatResponseText(responseText);

          // Simulate typing effect and speak
          typingEffect(responseText, textElement, botMsgDiv);

          // After a successful response, update chatHistory for multi-turn
          // For chat history, store the original markdown if the API needs it, or plain text
          chatHistory.push({ role: "user", parts: userContentParts });
          // Store the original, unformatted text from the model response for chat history
          chatHistory.push({ role: "model", parts: [{ text: data.text }] });

        } catch (error) {
          textElement.innerHTML = error.name === "AbortError" ? "Response generation stopped." : `Error: ${error.message}`;
          textElement.style.color = "#d62939";
          botMsgDiv.classList.remove("loading");
          document.body.classList.remove("bot-responding");
          scrollToBottom();
          // Ensure speech also stops on error
          if (speechUtterance && window.speechSynthesis.speaking) {
              window.speechSynthesis.cancel();
          }
        } finally {
          userData.file = {}; // Clear file data after each turn
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

        // Generate user message HTML with optional file attachment
        const userMsgHTML = `
          <p class="message-text"></p>
          ${userData.file.data ? (userData.file.isImage ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="img-attachment" />` : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${userData.file.fileName}</p>`) : ""}
        `;
        const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
        userMsgDiv.querySelector(".message-text").textContent = userData.message;
        chatsContainer.appendChild(userMsgDiv);
        scrollToBottom();

        setTimeout(() => {
          // Generate bot message HTML and add in the chat container
          const botMsgHTML = `<img class="avatar" src="https://stenoip.github.io/praterich_logo.png" /> <p class="message-text">Just a sec...</p>`;
          const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
          chatsContainer.appendChild(botMsgDiv);
          scrollToBottom();
          generateResponse(botMsgDiv);
        }, 600); // 600 ms delay
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
          // Store file data in userData obj
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
        // Stop speech
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
      document.querySelector("#delete-chats-btn").addEventListener("click", () => {
        chatHistory.length = 0;
        chatsContainer.innerHTML = "";
        document.body.classList.remove("chats-active", "bot-responding");
        // Stop speech if deleting chats
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
