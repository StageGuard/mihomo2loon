const express = require('express');
const fs = require('fs');
const path = require('path');
const { fetchConfig } = require('./lib/fetcher');
const { convert } = require('./lib/converter');

const app = express();
const port = 8080;
const CERT_DIR = path.join(__dirname, 'cert');
const CA_PASSPHRASE = '9S25L0J0'; // LOON CA(2026-01-08) 1767879220989

app.get('/sub', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        console.log(`Fetching config from: ${url}`);
        const mihomoConfig = await fetchConfig(url);

        // MITM Config check
        let mitmOptions = null;
        if (fs.existsSync(CERT_DIR)) {
            const files = fs.readdirSync(CERT_DIR).filter(f => f.endsWith('.p12'));
            if (files.length > 0) {
                const certPath = path.join(CERT_DIR, files[0]);
                try {
                    const p12Content = fs.readFileSync(certPath);
                    mitmOptions = {
                        p12: p12Content.toString('base64'),
                        passphrase: CA_PASSPHRASE,
                        hostnames: []
                    };
                    console.log(`Found certificate: ${files[0]}, enabling MITM.`);
                } catch (ce) {
                    console.warn(`Failed to read certificate ${certPath}: ${ce.message}`);
                }
            }
        }

        console.log('Converting config...');
        const loonConfig = convert(mihomoConfig, { mitm: mitmOptions });

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