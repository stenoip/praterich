 function callPraterichAI() {
    var url = "https://praterich.vercel.app/api/praterich";

    var payload = {
        system_instruction: {
            parts: [{ text: "You are a helpful assistant." }]
        },
        contents: [
            {
                role: "user",
                parts: [{ text: "Hello! What is the latest news?" }]
            }
        ],
        reasoning_effort: "none" // Options: "none", "default", "low", "medium", "high"
    };

    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    
    // Crucial: Tell the server you are sending JSON
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");

    xhr.onload = function () {
        if (xhr.readyState === 4) {
            var responseData = JSON.parse(xhr.responseText);

            if (xhr.status >= 200 && xhr.status < 300) {
                console.log("AI Response:", responseData.text);
            } else {
                console.error("Server Error (" + xhr.status + "):", responseData.error || xhr.responseText);
            }
        }
    };

    // Send the payload stringified
    xhr.send(JSON.stringify(payload));
}

// Call the function
callPraterichAI(); 
