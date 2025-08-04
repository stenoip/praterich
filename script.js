document.addEventListener('DOMContentLoaded', () => {
    // This code only runs on the search.html page
    if (window.location.pathname.includes('search.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');

        if (query) {
            document.getElementById('query-term').textContent = query;
            
            // Define the search engines and their URL templates
            const searchEngines = [
                { name: 'Google', id: 'google-iframe', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
                { name: 'Bing', id: 'bing-iframe', url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
                { name: 'Yahoo', id: 'yahoo-iframe', url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}` },
                { name: 'DuckDuckGo', id: 'ddg-iframe', url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` }
            ];

            // Set the source for each iframe
            searchEngines.forEach(engine => {
                const iframe = document.getElementById(engine.id);
                if (iframe) {
                    iframe.src = engine.url;
                }
            });
        }
    }
});
