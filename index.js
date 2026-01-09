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
const DOCS_REPO_URL = 'https://github.com/v2fly/domain-list-community.git';

// -------------------------------------------------------------------------
// Authentication Logic
// -------------------------------------------------------------------------
function generateAuthKey(length = 32) {
    const chars = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const AUTH_KEY = process.env.SERVICE_AUTH_KEY || generateAuthKey();

// -------------------------------------------------------------------------
// Git Update Logic
// -------------------------------------------------------------------------

function cloneRepo() {
    console.log('[Cron] Cloning domain-list-community...');
    exec(`git clone ${DOCS_REPO_URL} "${DOCS_DIR}"`, (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron] Git clone failed:', err.message);
            return;
        }
        console.log('[Cron] Git clone success:', stdout.trim());
    });
}

function updateRepo() {
    console.log('[Cron] Updating domain-list-community...');
    exec('git pull', { cwd: DOCS_DIR }, (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron] Git pull failed:', err.message);
            // If pull fails (e.g. not a git repo), try re-cloning
            // But be careful not to infinite loop if network is down.
            // For now, simpler error logging is enough.
            return;
        }
        console.log('[Cron] Git pull success:', stdout.trim());
    });
}

// Initial update or clone
if (fs.existsSync(DOCS_DIR) && fs.existsSync(path.join(DOCS_DIR, '.git'))) {
    updateRepo();
} else {
    // If dir missing or not a git repo (missing .git), clone it
    if (fs.existsSync(DOCS_DIR)) {
        // Clean up broken/empty dir if exists but valid .git is missing
        fs.rmSync(DOCS_DIR, { recursive: true, force: true });
    }
    cloneRepo();
}

// Schedule update
setInterval(() => {
    if (fs.existsSync(DOCS_DIR)) {
        updateRepo();
    } else {
        cloneRepo();
    }
}, 14400000); // 4 hours

// -------------------------------------------------------------------------
// Routes
// -------------------------------------------------------------------------

// Version Route (No Auth)
app.get('/version', (req, res) => {
    exec('git rev-parse HEAD && git show -s --format=%ci HEAD', (err, stdout) => {
        if (err) {
            console.error('[Version] Git command failed:', err.message);
            // Fallback if git fails (e.g. no git installed or not a repo)
            return res.json({
                error: 'Failed to retrieve version info',
                details: err.message
            });
        }
        const [hash, date] = stdout.trim().split('\n');
        res.json({
            commit: hash,
            date: date
        });
    });
});

// Middleware for Authentication
app.use((req, res, next) => {
    // Skip auth for version route (already handled, but good safety check if reordered)
    if (req.path === '/version') return next();

    const providedKey = req.query.auth;
    if (providedKey !== AUTH_KEY) {
        return res.status(401).send('401 Unauthorized');
    }
    next();
});

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

app.get('/plugin/geosite/:name', (req, res) => {
    const { name } = req.params;
    const dnsQuery = req.query.dns;
    console.log(`[Plugin] Request for geosite: ${name} with DNS: ${dnsQuery}`);

    if (!dnsQuery) {
        return res.status(400).send('# Missing dns query parameter');
    }

    const dnsServers = Array.isArray(dnsQuery) ? dnsQuery : [dnsQuery];
    // Loon Host usually accepts one server. We'll pick the first one.
    // If redundancy is needed, Loon might handle multiple lines for same domain? Use first for now.
    const targetDNS = dnsServers[0];
    const serverStr = `server:${targetDNS}`;

    const host = req.get('host');
    const geositeNames = name.split(',').map(s => s.trim()).filter(Boolean);

    let allDomains = [];

    try {
        for (const gn of geositeNames) {
            const domains = getGeositeDomains(gn);
            if (domains) {
                allDomains = allDomains.concat(domains);
            }
        }

        if (allDomains.length === 0) {
            return res.status(404).send('# No domains found for specified geosites');
        }

        const lines = [];
        // Metadata
        lines.push(`#!name= geosite-${name.replace(/,/g, '-')}`);
        lines.push(`#!desc= Plugin for flatten geosite rules in DNS nameserver-policy of mihomo.`);
        lines.push(`#!author= ${host}`);
        lines.push(`#!homepage= https://github.com/StageGuard/mihomo2loon`);
        lines.push(`#!icon= https://avatars.githubusercontent.com/u/84378451`);
        lines.push(`#!tag = mihomo,geosite`);
        lines.push(`#!date = ${new Date().toUTCString()}`);
        lines.push('');
        lines.push('[Host]');

        const seen = new Set();
        allDomains.forEach(d => {
            // Avoid duplicates if multiple geosites contain same domain
            const key = `${d.type}:${d.value}`;
            if (seen.has(key)) return;
            seen.add(key);

            if (d.type === 'DOMAIN') {
                lines.push(`${d.value} = ${serverStr}`);
            } else if (d.type === 'DOMAIN-SUFFIX') {
                // Map both wildcard and exact? Loon behavior:
                // .example.com usually covers *.example.com and example.com?
                // Wait, Loon syntax '.example.com' implies suffix. 
                // But our getGeositeDomains returns 'value' without dot for suffix usually (check implementation).
                // Implementation: 'google.com' for suffix.
                // Loon format: "*.google.com = server:..."
                lines.push(`*.${d.value} = ${serverStr}`);
                lines.push(`${d.value} = ${serverStr}`);
            }
            // Skip keywords for Host rules
        });

        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(lines.join('\n'));

    } catch (e) {
        console.error(`[Plugin] Error serving ${name}:`, e.message);
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
        const loonConfig = convert(mihomoConfig, { mitm: mitmOptions, baseUrl, authKey: AUTH_KEY });

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
    console.log(`---------------------------------------------------`);
    console.log(`Auth Key: ${AUTH_KEY}`);
    console.log(`---------------------------------------------------`);
});