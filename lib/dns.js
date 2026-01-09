const { getGeositeDomains } = require('./geosite');

function convertDNS(dnsConfig, options = {}) {
    const generalDNS = { dnsServer: '', dohServer: '', doqServer: '' };
    const hostRules = [];
    const pluginRules = []; // For Loon [Plugin]

    if (dnsConfig.enable) {
        // Nameservers
        const nameservers = dnsConfig.nameserver || [];
        const udpServers = [];
        const dohServers = [];
        const doqServers = [];

        // Simple categorization
        nameservers.forEach(ns => {
            if (ns.startsWith('https://')) dohServers.push(ns);
            else if (ns.startsWith('quic://')) doqServers.push(ns);
            else udpServers.push(ns);
        });

        if (udpServers.length > 0) generalDNS.dnsServer = udpServers.join(',');
        if (dohServers.length > 0) generalDNS.dohServer = dohServers.join(',');
        if (doqServers.length > 0) generalDNS.doqServer = doqServers.join(',');

        // Policy -> Host or Plugin
        const policy = dnsConfig['nameserver-policy'] || {};
        for (const [key, value] of Object.entries(policy)) {
            // Value is the DNS server(s) for this key
            // Ideally pick the first one if array, or strings (Mihomo usually treats array as fallback/group)
            // Loon Host supports single server usually, but we can check if it supports comma separated
            // or just pick one. For plugins we pass all.

            let targetServers = Array.isArray(value) ? value : [value];
            let targetServer = targetServers[0];

            const serverStr = `server:${targetServer}`;

            // Key can be domain, domain suffix (starts with +?), or geosite:
            if (key.startsWith('geosite:')) {
                const geositeVal = key.replace('geosite:', '').split(',');

                for (const geositeKey of geositeVal) {
                    if (options.baseUrl) {
                        // Use Plugin
                        pluginRules.push({
                            name: geositeKey,
                            servers: targetServers
                        });
                    } else {
                        // Flatten to [Host] if no baseUrl (fallback)
                        const domains = getGeositeDomains(geositeKey);
                        domains.forEach(d => {
                            // d.type: DOMAIN or DOMAIN-SUFFIX
                            if (d.type === 'DOMAIN') {
                                hostRules.push(`${d.value} = ${serverStr}`);
                            } else if (d.type === 'DOMAIN-SUFFIX') {
                                hostRules.push(`*.${d.value} = ${serverStr}`);
                                hostRules.push(`${d.value} = ${serverStr}`);
                            } else if (d.type === 'DOMAIN-KEYWORD') {
                                hostRules.push(`# Keyword rule skipped for Host: ${d.value}`);
                            }
                        });
                    }
                }
            } else {
                // Assume simple domain or wildcard
                // If it starts with +, it's usually domain suffix in some formats, but Mihomo uses explicit syntax?
                // Assuming key is just "google.com" or "*.google.com"
                hostRules.push(`${key} = ${serverStr}`);
            }
        }
    }

    return { generalDNS, hostRules, pluginRules };
}

module.exports = { convertDNS };
