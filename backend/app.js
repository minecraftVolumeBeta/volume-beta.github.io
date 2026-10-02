const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/proxy', async (req, res) => {
    const { endpoint, params } = req.body;
    if (!endpoint) {
        return res.status(400).json({ error: "Missing endpoint" });
    }
    try {
        const boomlingsData = new URLSearchParams();
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                boomlingsData.append(k, v);
            }
        }
        boomlingsData.append('secret', 'Wmfd2893gb7');

        const response = await fetch(`http://www.boomlings.com/database/${endpoint}.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': ''
            },
            body: boomlingsData
        });

        const textResponse = await response.text();
        res.send(textResponse);
    }
    catch (error) {
        console.error('Proxy error: ', error);
        res.status(500).json({ error: 'Failed to communicate with GD servers.' });
    }
});

app.post('/api/soundcloud', async (req, res) => {
    const { trackUrl } = req.body;
    if (!trackUrl) {
        return res.status(400).json({ error: 'Missing trackUrl' });
    }

    try {
        // 1. Resolve track using SoundCloud's official oembed endpoint
        const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trackUrl)}`;
        const oembedRes = await fetch(oembedUrl);

        if (!oembedRes.ok) {
            return res.status(404).json({ error: 'SoundCloud track not found' });
        }

        const oembedData = await oembedRes.json();

        // Extract Track ID from iframe HTML in oembed response
        const iframeHtml = oembedData.html || '';
        const trackIdMatch = iframeHtml.match(/tracks%2F(\d+)/) || iframeHtml.match(/tracks\/(\d+)/);

        if (!trackIdMatch) {
            return res.status(400).json({ error: 'Could not extract Track ID' });
        }

        const trackId = trackIdMatch[1];

        // 2. Query SoundCloud's public Widget API (does not require client_id)
        const widgetApiUrl = `https://api-widget.soundcloud.com/tracks/${trackId}`;
        const trackRes = await fetch(widgetApiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        if (!trackRes.ok) {
            return res.status(trackRes.status).json({ error: 'Failed to fetch metadata from Widget API' });
        }

        const trackData = await trackRes.json();

        if (!trackData.media || !trackData.media.transcodings || trackData.media.transcodings.length === 0) {
            return res.status(400).json({ error: 'No media transcodings available for this track' });
        }

        // 3. Find progressive MP3 or first available audio stream
        const transcoding = trackData.media.transcodings.find(t => t.format && t.format.protocol === 'progressive') 
                          || trackData.media.transcodings[0];

        // 4. Request stream CDN URL safely
        const streamRes = await fetch(transcoding.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        const rawText = await streamRes.text();
        
        // Handle empty/invalid JSON responses safely
        if (!rawText) {
            return res.status(400).json({ error: 'Empty response received from stream endpoint' });
        }

        let streamData;
        try {
            streamData = JSON.parse(rawText);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to parse stream location JSON response' });
        }

        if (!streamData.url) {
            return res.status(400).json({ error: 'No streamable URL returned' });
        }

        res.json({
            title: oembedData.title || trackData.title,
            author: oembedData.author_name || (trackData.user ? trackData.user.username : 'Unknown Artist'),
            streamUrl: streamData.url
        });

    } catch (error) {
        console.error('SoundCloud Error:', error);
        res.status(500).json({ error: 'Internal server error while resolving track' });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server listening on port ${PORT}`);
});