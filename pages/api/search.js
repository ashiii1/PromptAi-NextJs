import { performSearch } from '../../src/utils/searchUtils';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { query } = req.body;
    try {
      const results = await performSearch(query);
      res.status(200).json(results);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Error performing search', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}