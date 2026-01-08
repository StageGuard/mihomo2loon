const fs = require('fs');
const path = require('path');

// Base directory for domain lists
const DATA_DIR = path.join(__dirname, '../docs/domain-list-community/data');

/**
 * Parses a GEOSITE value and returns a list of domain objects.
 * @param {string} geositeValue - The value from "GEOSITE,value", e.g. "google" or "google@cn"
 * @returns {Array<{type: string, value: string}>} - Array of domain objects.
 */
function getGeositeDomains(geositeValue) {
    // Handle attributes like @cn (include only marked @cn) or !cn (exclude @cn) if present
    const parts = geositeValue.split('@');
    const filename = parts[0];
    const attribute = parts.length > 1 ? parts[1] : null;

    const domains = [];
    const processedFiles = new Set();

    function processFile(name, attr) {
        if (processedFiles.has(name)) return;
        processedFiles.add(name);

        const filePath = path.join(DATA_DIR, name);
        if (!fs.existsSync(filePath)) {
            console.warn(`Geosite file not found: ${filePath}`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                // Skip comments and empty lines
                if (!trimmed || trimmed.startsWith('#')) continue;

                // Structure: "type:domain @attr" or "domain @attr"
                const cleanLine = trimmed.split('#')[0].trim();
                if (!cleanLine) continue;

                // Split by space to check for attributes like @cn
                const lineParts = cleanLine.split(/\s+/);
                const domainSpec = lineParts[0];
                const lineAttrs = lineParts.slice(1).map(s => s.replace('@', ''));

                // Check attribute filtering
                if (attr) {
                    if (attr === 'cn' && !lineAttrs.includes('cn')) continue;
                    if (attr === '!cn' && lineAttrs.includes('cn')) continue;
                }

                // Handle Includes
                if (domainSpec.startsWith('include:')) {
                    const includeName = domainSpec.replace('include:', '');
                    processFile(includeName, attr);
                    continue;
                }

                // Handle Rules
                let ruleType = 'DOMAIN-SUFFIX';
                let domain = domainSpec;

                if (domainSpec.startsWith('full:')) {
                    ruleType = 'DOMAIN';
                    domain = domainSpec.replace('full:', '');
                } else if (domainSpec.startsWith('domain:')) {
                    ruleType = 'DOMAIN-SUFFIX';
                    domain = domainSpec.replace('domain:', '');
                } else if (domainSpec.startsWith('regexp:')) {
                    ruleType = 'URL-REGEX';
                    domain = domainSpec.replace('regexp:', '');
                    // Transform Domain Regex to URL Regex
                    // 1. If anchored at start (^), prepend https?://
                    if (domain.startsWith('^')) {
                        domain = domain.replace('^', '^https?://');
                    }
                    // 2. If anchored at end ($), replace with path match or end
                    if (domain.endsWith('$')) {
                        domain = domain.replace('$', '(:[0-9]+)?(/|$)');
                    }
                } else if (domainSpec.startsWith('keyword:')) {
                    ruleType = 'DOMAIN-KEYWORD';
                    domain = domainSpec.replace('keyword:', '');
                }

                domains.push({ type: ruleType, value: domain });
            }
        } catch (e) {
            console.error(`Error processing geosite file ${name}: ${e.message}`);
        }
    }

    processFile(filename, attribute);
    return domains;
}

/**
 * Parses a GEOSITE rule and returns a list of Loon rules.
 * @param {string} geositeValue - The value from "GEOSITE,value,Target"
 * @param {string} target - The proxy/group target.
 * @returns {string[]} - Array of Loon rule strings.
 */
function expandGeosite(geositeValue, target) {
    const domains = getGeositeDomains(geositeValue);
    return domains.map(d => `${d.type},${d.value},${target}`);
}

module.exports = { expandGeosite, getGeositeDomains };
