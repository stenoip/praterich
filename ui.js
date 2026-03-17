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
var chatContainer = document.getElementById('chat-container'); 
var charCounter = document.getElementById('char-counter'); 
var suggestionItems = document.querySelectorAll('.suggestions-item');
var filePreviewContainer = document.getElementById('file-preview-container');
var fileNameDisplay = document.getElementById('file-name');
var fileIcon = document.getElementById('file-icon');
var removeFileButton = document.getElementById('remove-file-button');
var suggestionBox = document.getElementById('suggestion-box');
var webSearchToggle = document.getElementById('web-search-toggle');
var webSearchIcon = document.getElementById('web-search-icon');

// --- UI Helper Functions ---
function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
}

function updateCharCount() {
    var count = userInput.value.length;
    // MAX_CHARS comes from script.js
    charCounter.textContent = `${count} / ${MAX_CHARS} characters.`;
    
    if (count > MAX_CHARS) {
        charCounter.classList.add('limit-warning');
        charCounter.innerHTML = `${count} / ${MAX_CHARS} characters. Consider uploading a <span id="txt-suggestion" class="limit-suggestion">.txt file</span>.`;
        var txtSuggestion = document.getElementById('txt-suggestion');
        if (txtSuggestion) {
            txtSuggestion.onclick = function() {
                fileUpload.setAttribute('accept', '.txt,text/plain');
                fileUpload.click();
            };
        }
    } else {
        charCounter.classList.remove('limit-warning');
        charCounter.style.color = '#622';
        fileUpload.setAttribute('accept', '*'); 
    }
    
    updateSendButtonState();
    autoResizeTextarea();
}

function updateSendButtonState() {
    var text = userInput.value.trim();
    // attachedFile comes from script.js
    var file = typeof attachedFile !== 'undefined' ? attachedFile : null;
    var charCountValid = text.length > 0 && text.length <= MAX_CHARS;
    
    if (charCountValid || file) {
        sendButton.removeAttribute('disabled');
    } else {
        sendButton.setAttribute('disabled', 'disabled');
    }
}

function getFileIcon(fileName) {
    var ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp':
            return 'fas fa-image';
        case 'pdf': return 'fas fa-file-pdf';
        case 'txt': case 'log': return 'fas fa-file-alt';
        case 'js': case 'ts': case 'html': case 'css': case 'py': case 'java': case 'c':
            return 'fas fa-file-code';
        case 'zip': case 'rar': return 'fas fa-file-archive';
        default: return 'fas fa-file';
    }
}

// --- Basic Event Listeners ---
userInput.addEventListener('input', updateCharCount);
userInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!sendButton.hasAttribute('disabled') && typeof sendMessage === 'function') {
            sendMessage();
        }
    }
});

uploadButton.addEventListener('click', function() {
    fileUpload.click();
});

removeFileButton.addEventListener('click', function() {
    if (typeof clearAttachedFile === 'function') clearAttachedFile();
});

menuToggleButton.addEventListener('click', function() {
    sidebar.classList.toggle('open');
});

chatContainer.addEventListener('click', function() {
    if (sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }
});

if (suggestionItems) {
    suggestionItems.forEach(function(item) {
        item.addEventListener('click', function() {
            userInput.value = item.querySelector('p').textContent.trim();
            updateCharCount(); 
            userInput.focus();
        });
    });
}
