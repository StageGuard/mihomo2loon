const { getGeositeDomains } = require('./geosite');

function convertDNS(dnsConfig) {
    const generalDNS = { dnsServer: '', dohServer: '', doqServer: '' };
    const hostRules = [];

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

        // Policy -> Host
        const policy = dnsConfig['nameserver-policy'] || {};
        for (const [key, value] of Object.entries(policy)) {
            // Value is the DNS server(s) for this key
            // Ideally pick the first one if array, or strings
            // Loon Host format: domain = server:IP or server:https://...

            let targetServer = value;
            if (Array.isArray(value)) targetServer = value[0];

            // Format target for Loon
            // if target is IP, server:IP
            // if target is https://, server:https://...
            // if target is quic://, server:quic://...
            // Wait, Loon manual: example.com = server:8.8.4.4

            const serverStr = `server:${targetServer}`;

            // Key can be domain, domain suffix (starts with +?), or geosite:
            if (key.startsWith('geosite:')) {
                const geositeVal = key.replace('geosite:', '');
                const domains = getGeositeDomains(geositeVal);
                domains.forEach(d => {
                    // d.type: DOMAIN or DOMAIN-SUFFIX
                    // Loon [Host]:
                    // DOMAIN -> "domain = server:..."
                    // DOMAIN-SUFFIX -> "*.domain = server:..."

                    if (d.type === 'DOMAIN') {
                        hostRules.push(`${d.value} = ${serverStr}`);
                    } else if (d.type === 'DOMAIN-SUFFIX') {
                        hostRules.push(`*.${d.value} = ${serverStr}`);
                        // Also map exact domain? Usually suffix implies wildcard but sometimes main domain too
                        hostRules.push(`${d.value} = ${serverStr}`);
                    } else if (d.type === 'DOMAIN-KEYWORD') {
                        // Not supported in [Host] usually
                        hostRules.push(`# Keyword rule skipped for Host: ${d.value}`);
                    }
                });
            } else {
                // Assume simple domain or wildcard
                // If it starts with +, it's usually domain suffix in some formats, but Mihomo uses explicit syntax?
                // Assuming key is just "google.com" or "*.google.com"
                // If standard domain:
                hostRules.push(`${key} = ${serverStr}`);
            }
        }
    }

    return { generalDNS, hostRules };
}

module.exports = { convertDNS };
