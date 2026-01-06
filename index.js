const express = require('express');
const { fetchConfig } = require('./lib/fetcher');
const { convert } = require('./lib/converter');

const app = express();
const port = 8080;

app.get('/sub', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        console.log(`Fetching config from: ${url}`);
        const mihomoConfig = await fetchConfig(url);

        console.log('Converting config...');
        const loonConfig = convert(mihomoConfig);

        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(loonConfig);
        console.log('Conversion successful.');
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send(`Conversion failed: ${error.message}`);
    }
});

app.listen(port, () => {
    console.log(`Mihomo2Loon server listening at http://localhost:${port}`);
});