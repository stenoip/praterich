import requests
from bs4 import BeautifulSoup
import json

CRAWL_URLS = [
    "https://stenoip.github.io/",
    "https://stenoip.github.io/praterich/",
    "https://stenoip.github.io/about.html",
    "https://stenoip.github.io/services.html"
]

def crawl_sites():
    combined_content = ""
    for url in CRAWL_URLS:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            all_text = soup.body.get_text(separator=' ', strip=True) if soup.body else ""
            image_descriptions = []
            for img in soup.find_all('img'):
                alt = img.get('alt')
                if alt:
                    image_descriptions.append(f"Image description: {alt}")
            combined_content += f"--- Content from {url} ---\n{all_text}\n" + "\n".join(image_descriptions) + "\n"
        except Exception as e:
            print(f"Error crawling {url}: {e}")
    return combined_content

def main():
    crawled_data = crawl_sites()
    output_data = {
        "website_info": crawled_data
    }
    with open('index.json', 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print("index.json has been created/updated!")

if __name__ == "__main__":
    main()

"""
===========================
How to use this crawler
===========================

1. Make sure you have Python 3, requests, and beautifulsoup4 installed.
   Install dependencies if needed:
       pip install requests beautifulsoup4

2. Run the crawler from your computer terminal:
       python oodles.py

3. This will create or update a file named 'index.json' in the same folder.

4. Move or copy 'index.json' into your project's 'api/' directory.

5. Upload and commit the new file to GitHub:
       git add api/index.json
       git commit -m "Update crawled website info"
       git push

Now your backend API will serve up-to-date site information!
"""