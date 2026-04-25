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
var filePreviewContainer = document.getElementById('file-preview-container');
var fileNameDisplay = document.getElementById('file-name');
var fileIcon = document.getElementById('file-icon');
var removeFileButton = document.getElementById('remove-file-button');
var suggestionBox = document.getElementById('suggestion-box');
var webSearchToggle = document.getElementById('web-search-toggle');
var webSearchIcon = document.getElementById('web-search-icon');
var micButton = document.getElementById('mic-button');

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
    // MAX_CHARS is defined in script.js
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
    // attachedFile is managed in script.js
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

function setMicActive(isActive) {
    const icon = micButton.querySelector('i');
    if (isActive) {
        micButton.style.color = '#ef4444'; // Red for recording
        icon.className = 'fas fa-microphone-lines'; // Animating icon if using FA Pro, otherwise just keep it
        userInput.placeholder = "Listening...";
    } else {
        micButton.style.color = '';
        icon.className = 'fas fa-microphone';
        userInput.placeholder = "Type your message here...";
    }
}

// --- Suggestion Cycling Logic ---

var suggestionTimer = null;

function initSuggestionCycling() {
    // Clear existing timer to prevent multiple loops
    if (suggestionTimer) clearInterval(suggestionTimer);

    // Look for items currently inside the chat window (handles cloned items)
    var items = chatWindow.querySelectorAll('.suggestions-item');
    if (!items.length) return;

    var currentIndex = 0;

    function showNextSuggestion() {
        items.forEach(item => item.classList.remove('active'));
        if (items[currentIndex]) {
            items[currentIndex].classList.add('active');
            currentIndex = (currentIndex + 1) % items.length;
        }
    }

    // Start cycle
    showNextSuggestion();
    suggestionTimer = setInterval(showNextSuggestion, 4000);

    // Handle clicks on suggestions
    items.forEach(function(item) {
        item.addEventListener('click', function() {
            clearInterval(suggestionTimer);
            var text = item.querySelector('p').textContent.trim();
            userInput.value = text;
            updateCharCount();
            userInput.focus();
            
            var box = item.closest('#suggestion-box');
            if (box) box.style.display = 'none';
        });
    });
}

// --- Event Listeners ---

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

// Sidebar Toggle Logic
menuToggleButton.addEventListener('click', function(e) {
    e.stopPropagation();
    sidebar.classList.toggle('open');
    
    // Toggle Icon between Bars and X
    var icon = menuToggleButton.querySelector('i');
    if (sidebar.classList.contains('open')) {
        icon.className = 'fas fa-times';
    } else {
        icon.className = 'fas fa-bars';
    }
});

// Close sidebar when clicking main chat area (Mobile)
chatContainer.addEventListener('click', function() {
    if (sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        var icon = menuToggleButton.querySelector('i');
        if(icon) icon.className = 'fas fa-bars';
    }
});

// Initial run on page load
document.addEventListener('DOMContentLoaded', function() {
    initSuggestionCycling();
});
