var API_URL = "https://praterich.vercel.app/api/praterich"; 
var gameContainer = document.getElementById('game-container');
var commandInput = document.getElementById('command-input');
var submitButton = document.getElementById('submit-button');
var locationInput = document.getElementById('location-input');
var difficultySelect = document.getElementById('difficulty');

// Game state
var worldState = {
    location: "A serene field",
    inventory: [],
    objects: [],
    score: 0,
    game_over: false,
    quests: []
};

var startScreen = document.getElementById('start-screen');
var gameScreen = document.getElementById('game-screen');
var continueBtn = document.getElementById('continue-btn');
var newBtn = document.getElementById('new-btn');

// World Generation (randomized)
function generateRandomWorld() {
    const locations = [
        "A haunted forest",
        "A peaceful meadow",
        "An ancient ruined castle",
        "A dark dungeon",
        "A sunny beach",
        "A snowy mountain pass",
        "A bustling marketplace"
    ];
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    return randomLocation;
}

// Check if the location is age-appropriate
function checkAgeAppropriateness(location) {
    const inappropriateLocations = ["haunted forest", "dark dungeon"];
    for (let i = 0; i < inappropriateLocations.length; i++) {
        if (location.toLowerCase().includes(inappropriateLocations[i])) {
            return false;
        }
    }
    return true;
}

// Handle user input for starting location
newBtn.addEventListener('click', function() {
    const userLocation = locationInput.value.trim();
    
    // If the user didn't provide a location, generate a random one
    if (!userLocation) {
        worldState.location = generateRandomWorld();
        addMessage("You are starting in a " + worldState.location + ".", "ai");
    } else {
        if (checkAgeAppropriateness(userLocation)) {
            worldState.location = userLocation;
            addMessage("Starting location: " + worldState.location, "ai");
        } else {
            addMessage("The location you chose is too spooky. How about a sunny beach?", "ai");
            worldState.location = "A sunny beach"; // Default safe location
        }
    }

    // Set up other initial game parameters
    worldState.inventory = [];
    worldState.objects = [];
    worldState.score = 0;
    worldState.quests = [];
    worldState.game_over = false;

    localStorage.setItem("praterich_world", JSON.stringify(worldState));
    localStorage.setItem("praterich_difficulty", difficultySelect.value);

    startScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    document.getElementById('input-container').style.display = 'flex';
    gameContainer.style.display = 'block';
    sendCommand("Start new game in " + worldState.location);
});

// Function to add messages
function addMessage(text, sender) {
    var div = document.createElement('div');
    div.className = 'message ' + sender;
    div.textContent = text;
    gameContainer.appendChild(div);
    gameContainer.scrollTop = gameContainer.scrollHeight;
}

// Function to send commands
function sendCommand(command) {
    if (!command.trim() || worldState.game_over) return;

    addMessage("> " + command, "user");

    var requestBody = {
        contents: [{ role: 'user', parts: [{ text: command }] }],
        world_state: worldState,
        difficulty: localStorage.getItem("praterich_difficulty") || "easy"
    };

    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestBody)
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        var aiText = data.text || "Praterich did not respond.";
        addMessage(aiText, "ai");
    })
    .catch(function(err) {
        addMessage("Praterich could not respond. Try again.", "ai");
    });
}

// Start screen buttons
continueBtn.addEventListener('click', function() {
    startScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    document.getElementById('input-container').style.display = 'flex';
    gameContainer.style.display = 'block';
    sendCommand("Continue game");
});
