async function performSearch(query) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  console.log('Performing search for query:', query);
  console.log('API Key:', apiKey ? 'Defined' : 'Undefined');
  console.log('Search Engine ID:', searchEngineId ? 'Defined' : 'Undefined');

  if (!apiKey || !searchEngineId) {
    console.error('API Key or Search Engine ID is missing');
    return [];
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

  try {
    console.log('Fetching from URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Search API Error:', errorData);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Search results:', data);
    return data.items || [];
  } catch (error) {
    console.error("Error performing search:", error);
    return [];
  }
}

function formatSearchResults(results) {
  if (!results || results.length === 0) {
    return "No results found.";
  }

  return results.slice(0, 3).map(item => {
    return `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}\n`;
  }).join("\n");
}

export { performSearch, formatSearchResults };