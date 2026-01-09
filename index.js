const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { fetchConfig } = require('./lib/fetcher');
const { convert } = require('./lib/converter');
const { getGeositeDomains } = require('./lib/geosite');

const app = express();
const port = 8080;
const CERT_DIR = path.join(__dirname, 'cert');
const CA_PASSPHRASE = '9S25L0J0';
const DOCS_DIR = path.join(__dirname, 'docs', 'domain-list-community');

// -------------------------------------------------------------------------
// Git Update Logic
// -------------------------------------------------------------------------
function updateRepo() {
    console.log('[Cron] Updating domain-list-community...');
    exec('git pull', { cwd: DOCS_DIR }, (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron] Git pull failed:', err.message);
            return;
        }
        console.log('[Cron] Git pull success:', stdout.trim());
    });
}

// Initial update
if (fs.existsSync(DOCS_DIR)) {
    updateRepo();
    // Update every 4 hours (4 * 60 * 60 * 1000)
    setInterval(updateRepo, 14400000);
} else {
    console.warn(`[Cron] Docs dir not found at ${DOCS_DIR}, skipping auto-update.`);
}

// -------------------------------------------------------------------------
// Routes
// -------------------------------------------------------------------------

app.get('/geosite/:name.list', (req, res) => {
    const { name } = req.params;
    console.log(`[Geosite] Request for: ${name}`);

    try {
        // getGeositeDomains reads from disk. Caching is handled by OS/FS or could be added here.
        // Since we want fresh data after git pull, reading from disk is fine for now.
        const domains = getGeositeDomains(name);

        if (!domains || domains.length === 0) {
            return res.status(404).send('# Geosite not found or empty');
        }

        // Convert domains to simple rule list lines
        // For Remote Rule (list file), format is typically just:
        // DOMAIN,example.com
        // DOMAIN-SUFFIX,example.org
        const lines = domains.map(d => `${d.type},${d.value}`);

        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(lines.join('\n'));
    } catch (e) {
        console.error(`[Geosite] Error serving ${name}:`, e.message);
        res.status(500).send(`# Error: ${e.message}`);
    }
});

app.get('/sub', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        console.log(`Fetching config from: ${url}`);
        const mihomoConfig = await fetchConfig(url);

        // MITM Config check
        let mitmOptions = {
            hostnames: []
        };

        if (fs.existsSync(CERT_DIR)) {
            const files = fs.readdirSync(CERT_DIR).filter(f => f.endsWith('.p12'));
            if (files.length > 0) {
                const certPath = path.join(CERT_DIR, files[0]);
                try {
                    const p12Content = fs.readFileSync(certPath);
                    mitmOptions.p12 = p12Content.toString('base64');
                    mitmOptions.passphrase = CA_PASSPHRASE;
                    console.log(`Found certificate: ${files[0]}, enabling MITM.`);
                } catch (ce) {
                    console.warn(`Failed to read certificate ${certPath}: ${ce.message}`);
                }
            }
        }

        // Base URL for Remote Rules
        const protocol = req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        console.log('Converting config...');
        const loonConfig = convert(mihomoConfig, { mitm: mitmOptions, baseUrl });

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