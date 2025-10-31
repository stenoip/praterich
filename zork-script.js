var API_URL = "https://praterich.vercel.app/api/praterich"; // Replace with your API
var gameContainer = document.getElementById('game-container');
var commandInput = document.getElementById('command-input');
var submitButton = document.getElementById('submit-button');

var startScreen = document.getElementById('start-screen');
var gameScreen = document.getElementById('game-screen');
var continueBtn = document.getElementById('continue-btn');
var newBtn = document.getElementById('new-btn');
var difficultySelect = document.getElementById('difficulty');

var customPronunciations = { "Praterich": "Prah-ter-rich", "Stenoip": "Stick-no-ip" };
var ladyPraterichSystemInstruction = `
You are Praterich, guiding a player in a text-based world. 
Maintain a world state with rooms, objects, inventory, and score.
Respond as a text adventure narrator to player commands.
`;

var conversationHistory = JSON.parse(localStorage.getItem("praterich_history")) || [
    { role: 'user', parts: [{ text: "Start the game" }] }
];

var worldState = JSON.parse(localStorage.getItem("praterich_world")) || {
    location: "a blank white void",
    inventory: [],
    objects: [],
    score: 0,
    game_over: false
};

function scrollToBottom() {
    gameContainer.scrollTop = gameContainer.scrollHeight;
}

function addMessage(text, sender) {
    var div = document.createElement('div');
    div.className = 'message ' + sender;
    div.textContent = text;
    gameContainer.appendChild(div);
    scrollToBottom();
}

// Play sounds using an API
function playSound(type) {
    var url;
    switch(type) {
        case 'success':
            url = "https://freesound.org/data/previews/320/320655_5260877-lq.mp3"; 
            break;
        case 'failure':
            url = "https://freesound.org/data/previews/331/331912_3248244-lq.mp3";
            break;
        case 'gameover':
            url = "https://freesound.org/data/previews/219/219457_4109218-lq.mp3";
            break;
        default:
            return;
    }
    var audio = new Audio(url);
    audio.play();
}

// Text-to-speech
function speakText(text) {
    if (!('speechSynthesis' in window)) return;

    var speakableText = text;
    for (var word in customPronunciations) {
        var regex = new RegExp('\\b' + word + '\\b', 'gi');
        speakableText = speakableText.replace(regex, customPronunciations[word]);
    }

    var utterance = new SpeechSynthesisUtterance(speakableText);
    utterance.rate = 1.3;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

function checkGameOver(response) {
    if (response.game_over) {
        addMessage("GAME OVER! Final Score: " + response.score, "ai");
        playSound('gameover');
        worldState.game_over = true;
        localStorage.setItem("praterich_world", JSON.stringify(worldState));
        return true;
    }
    return false;
}

function sendCommand(command) {
    if (!command.trim() || worldState.game_over) return;

    addMessage("> " + command, "user");

    conversationHistory.push({ role: 'user', parts: [{ text: command }] });
    localStorage.setItem("praterich_history", JSON.stringify(conversationHistory));

    var requestBody = {
        contents: conversationHistory,
        system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] },
        world_state: worldState,
        difficulty: localStorage.getItem("praterich_difficulty") || "easy"
    };

    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestBody)
    })
    .then(function(response) {
        if (!response.ok) throw new Error("API Error");
        return response.json();
    })
    .then(function(data) {
        var aiText = data.text || "Praterich did not respond.";
        addMessage(aiText, "ai");
        speakText(aiText);

        conversationHistory.push({ role: 'model', parts: [{ text: aiText }] });
        localStorage.setItem("praterich_history", JSON.stringify(conversationHistory));

        if (data.world_state) {
            worldState = data.world_state;
            localStorage.setItem("praterich_world", JSON.stringify(worldState));
        }

        if (data.event) {
            if (data.event === "success") playSound('success');
            if (data.event === "failure") playSound('failure');
        }

        checkGameOver(data);

    })
    .catch(function(err) {
        addMessage("Praterich could not respond. Try again.", "ai");
        playSound('failure');
        console.error(err);
    });
}

submitButton.addEventListener('click', function() {
    var cmd = commandInput.value;
    commandInput.value = '';
    sendCommand(cmd);
});

commandInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitButton.click();
    }
});

// Start screen buttons
continueBtn.addEventListener('click', function() {
    startScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    document.getElementById('input-container').style.display = 'flex';
    gameContainer.style.display = 'block';
    sendCommand("Continue game");
});

newBtn.addEventListener('click', function() {
    localStorage.removeItem("praterich_history");
    localStorage.removeItem("praterich_world");
    conversationHistory = [{ role: 'user', parts: [{ text: "Start the game" }] }];
    worldState = { location: "a blank white void", inventory: [], objects: [], score: 0, game_over: false };

    localStorage.setItem("praterich_difficulty", difficultySelect.value);

    startScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    document.getElementById('input-container').style.display = 'flex';
    gameContainer.style.display = 'block';
    sendCommand("Start new game on " + difficultySelect.value + " difficulty");
});
