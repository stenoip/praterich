document.addEventListener('DOMContentLoaded', () => {
    // This code only runs on the search.html page
    if (window.location.pathname.includes('search.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');

        if (query) {
            document.getElementById('query-term').textContent = query;
            const resultsContainer = document.getElementById('results-container');
            
            // Define the search engines and their URL templates
            const searchEngines = [
                { name: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
                { name: 'Bing', url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
                { name: 'Yahoo', url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}` },
                { name: 'DuckDuckGo', url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` }
            ];

            // Create a link for each search engine
            searchEngines.forEach(engine => {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'search-result-card'; // Use a class for CSS styling
                resultDiv.innerHTML = `
                    <h3><a href="${engine.url}" target="_blank">Search on ${engine.name}</a></h3>
                    <p>Click the link above to see the search results for your query on ${engine.name}.</p>
                `;
                resultsContainer.appendChild(resultDiv);
            });
        }
    }
});
