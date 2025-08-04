document.addEventListener('DOMContentLoaded', () => {
    // 1. Define Your Data
    const documents = [
        {
            id: '1',
            title: 'Oodles Metasearch Engine Project',
            body: 'This is the a project to build a simple metasearch engine called Oodles.'
        },
        {
            id: '2',
            title: 'Stenoip Company',
            body: 'Stenoip Company is the copyright holder for the Oodles project.'
        },
        {
            id: '3',
            title: 'Javascript for Beginners',
            body: 'Learn the fundamentals of Javascript to create interactive websites.'
        },
        {
            id: '4',
            title: 'HTML and CSS Styling',
            body: 'This document explains how to style your websites using HTML and CSS.'
        },
    ];

    // 2. Build the Lunr.js Index
    const idx = lunr(function () {
        this.ref('id');
        this.field('title');
        this.field('body');
    
        documents.forEach(function (doc) {
            this.add(doc);
        }, this);
    });

    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('search-form');
    const resultsContainer = document.getElementById('results-container');

    // 3. Handle the Search
    searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = searchInput.value;
        resultsContainer.innerHTML = ''; // Clear previous results

        if (query) {
            const searchResults = idx.search(query);

            if (searchResults.length === 0) {
                resultsContainer.innerHTML = '<p>No results found.</p>';
            } else {
                searchResults.forEach(result => {
                    // Find the original document from our data
                    const doc = documents.find(d => d.id === result.ref);
                    
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'search-result';
                    resultDiv.innerHTML = `
                        <h3>${doc.title}</h3>
                        <p>${doc.body}</p>
                    `;
                    resultsContainer.appendChild(resultDiv);
                });
            }
        }
    });
});
