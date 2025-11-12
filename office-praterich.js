// ========= CONFIG =========
var API_URL = "https://praterich.vercel.app/api/praterich";
var ladyPraterichSystemInstruction = `
You are Praterich, an AI developed by Stenoip Company.

Your personality: intelligent yet casual. Speak naturally and human-like. Use metric units, never Imperial.

You were created by Stenoip Company and value clarity and reliability. You are capable of reasoning, creativity, and document editing.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person.

When the user uploads or edits a document, you analyze and improve it based on their instructions, producing clear, refined text.
`;

var editor = document.getElementById("editor");
var sendBtn = document.getElementById("sendBtn");
var commandInput = document.getElementById("command");
var fileInput = document.getElementById("fileInput");
var fileNameDisplay = document.getElementById("fileName");
var statusText = document.getElementById("status");
var aiResponse = document.getElementById("aiResponse");
var attachedFile = null;

// ========= FILE HANDLING =========
fileInput.addEventListener("change", function() {
  var file = fileInput.files[0];
  if (!file) return;
  fileNameDisplay.textContent = file.name;
  var reader = new FileReader();
  reader.onload = function() {
    attachedFile = {
      name: file.name,
      type: file.type || "application/octet-stream",
      data: reader.result.split(",")[1]
    };
    editor.textContent = "File '" + file.name + "' loaded. You can now give me commands like 'summarize this file' or 'edit grammar'.";
  };
  reader.readAsDataURL(file);
});

// ========= MAIN LOGIC =========
sendBtn.addEventListener("click", async function() {
  var text = commandInput.value.trim();
  var contentText = editor.innerText.trim();

  if (!text && !attachedFile && !contentText) {
    alert("Please upload or write a document and enter a command.");
    return;
  }

  sendBtn.disabled = true;
  statusText.textContent = "Praterich is processing...";
  aiResponse.innerHTML = "";

  var parts = [];

  if (attachedFile) {
    parts.push({
      inlineData: {
        mimeType: attachedFile.type,
        data: attachedFile.data
      }
    });
  } else if (contentText) {
    parts.push({ text: contentText });
  }

  parts.push({ text: text || "Analyze and improve this document." });

  var body = {
    contents: [{ role: "user", parts: parts }],
    system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
  };

  try {
    var res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("API error: " + res.status);
    var data = await res.json();
    var aiText = data.text || "(No response)";

    // Display response and update live preview
    aiResponse.innerHTML = "<b><i class='fas fa-robot'></i> Praterich:</b> " + aiText;
    editor.innerText = aiText;

  } catch (err) {
    aiResponse.innerHTML = "<i class='fas fa-exclamation-triangle'></i> Error: " + err.message;
  } finally {
    sendBtn.disabled = false;
    statusText.textContent = "";
    commandInput.value = "";
  }
});
