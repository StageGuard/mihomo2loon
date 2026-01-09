const { convertDNS } = require('./dns');
const { convertProxy } = require('./proxy');
const { convertGroup } = require('./group');
const { convertRule, parseRule } = require('./rule');

function convert(mihomoConfig, options = {}) {
    const lines = [];

    // Extract DNS config first
    const dnsConfig = mihomoConfig.dns || {};
    const { generalDNS, hostRules, pluginRules } = convertDNS(dnsConfig, options);

    // [General]
    lines.push('[General]');
    // ... (ipv6, allow-lan, etc.) ...
    if (mihomoConfig['ipv6']) {
        lines.push('ipv6 = true');
    }
    if (mihomoConfig['allow-lan']) {
        lines.push('allow-wifi-access = true');
    }

    // DNS Settings
    if (generalDNS.dnsServer) lines.push(`dns-server = ${generalDNS.dnsServer}`);
    if (generalDNS.dohServer) lines.push(`doh-server = ${generalDNS.dohServer}`);
    if (generalDNS.doqServer) lines.push(`doq-server = ${generalDNS.doqServer}`);

    if (hostRules.length > 0) {
        lines.push('[Host]');
        hostRules.forEach(h => lines.push(h));
        lines.push('');
    }

    lines.push('');

    // [Proxy]
    lines.push('[Proxy]');
    const proxies = mihomoConfig.proxies || [];
    proxies.forEach(p => {
        try {
            const line = convertProxy(p);
            if (line) lines.push(line);
        } catch (e) {
            console.warn(`Skipping proxy ${p.name}: ${e.message}`);
        }
    });
    lines.push('');

    // [Plugin]
    if (pluginRules && pluginRules.length > 0) {
        lines.push('[Plugin]');
        pluginRules.forEach(p => {
            // Construct URL: {baseUrl}/plugin/geosite/{name}?dns=s1&dns=s2
            let query = p.servers.map(s => `dns=${encodeURIComponent(s)}`).join('&');
            if (options.authKey) {
                query += `&auth=${encodeURIComponent(options.authKey)}`;
            }
            const url = `${options.baseUrl}/plugin/geosite/${p.name}?${query}`;
            lines.push(`${url}, policy=PROXY, enabled=true, tag=geosite-${p.name.replace(/,/g, '-')}`);
        });
        lines.push('');
    }

    // [Proxy Group]
    lines.push('[Proxy Group]');
    const groups = mihomoConfig['proxy-groups'] || [];
    groups.forEach(g => {
        try {
            const line = convertGroup(g);
            if (line) lines.push(line);
        } catch (e) {
            console.warn(`Skipping group ${g.name}: ${e.message}`);
        }
    });

    lines.push('');

    // [Rule] & [Remote Rule] logic
    const rules = mihomoConfig.rules || [];
    const normalRules = [];
    const remoteRules = [];

    rules.forEach(r => {
        const parsed = parseRule(r);
        // If it's a GEOSITE and we have a baseUrl, use Remote Rule

        if (parsed && parsed.type === 'GEOSITE' && options.baseUrl && !r.startsWith('AND') && !r.startsWith('OR') && !r.startsWith('NOT')) {
            // Remote Rule: url, policy=Target, enabled=true
            // Construct URL: {baseUrl}/rule/geosite/{value}.list
            let url = `${options.baseUrl}/rule/geosite/${parsed.value}.list`;
            if (options.authKey) {
                url += `?auth=${encodeURIComponent(options.authKey)}`;
            }
            const policy = parsed.target || 'DIRECT'; // Default if missing
            remoteRules.push(`${url},policy=${policy},enabled=true,tag=${parsed.value}`);
        } else {
            const line = convertRule(r);
            if (line) normalRules.push(line);
        }
    });

    // Output [Remote Rule]
    if (remoteRules.length > 0) {
        lines.push('[Remote Rule]');
        remoteRules.forEach(r => lines.push(r));
        lines.push('');
    }

    // Output [Rule]
    lines.push('[Rule]');
    normalRules.forEach(r => lines.push(r));

    lines.push('');

    // [Host]
    if (hostRules.length > 0) {
        lines.push('[Host]');
        hostRules.forEach(h => lines.push(h));
    }

    // [MITM]
    if (options.mitm) {
        lines.push('');
        lines.push('[MITM]');
        lines.push('enable = true');
        lines.push('skip-server-cert-verify = true');
        if (options.mitm.p12) lines.push(`ca-p12 = ${options.mitm.p12}`);
        if (options.mitm.passphrase) lines.push(`ca-passphrase = ${options.mitm.passphrase}`);
        if (options.mitm.hostnames && options.mitm.hostnames.length > 0) {
            lines.push(`hostname = ${options.mitm.hostnames.join(',')}`);
        }
    }

    return lines.join('\n');
}

module.exports = { convert };
