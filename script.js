// script.js
document.addEventListener('DOMContentLoaded', async () => {
    let searchIndex = null;
    let documents = [];

    try {
        const response = await fetch('index.json');
        const data = await response.json();
        searchIndex = data.index;
        documents = data.documents;
        console.log('Index loaded successfully.');
    } catch (error) {
        console.error('Failed to load search index:', error);
        return;
    }

    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const resultsContainer = document.getElementById('results-container');

    searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = searchInput.value.toLowerCase();
        resultsContainer.innerHTML = ''; // Clear previous results

        if (!query || !searchIndex) {
            resultsContainer.innerHTML = '<p>No index available or empty query.</p>';
            return;
        }

        const queryTokens = query.match(/\b\w+\b/g) || [];
        const matchingDocIds = new Set();
        
        queryTokens.forEach(token => {
            if (searchIndex[token]) {
                searchIndex[token].forEach(docId => matchingDocIds.add(docId));
            }
        });

        if (matchingDocIds.size === 0) {
            resultsContainer.innerHTML = '<p>No results found for your query.</p>';
        } else {
            matchingDocIds.forEach(docId => {
                const doc = documents.find(d => d.id === docId);
                if (doc) {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'search-result';
                    resultDiv.innerHTML = `
                        <h3><a href="${doc.url}" target="_blank">${doc.title}</a></h3>
                        <p>${doc.body}</p>
                    `;
                    resultsContainer.appendChild(resultDiv);
                }
            });
        }
    });
});
