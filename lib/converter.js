const { convertDNS } = require('./dns');
const { convertProxy } = require('./proxy');
const { convertGroup } = require('./group');
const { convertRule } = require('./rule');

function convert(mihomoConfig, options = {}) {
    const lines = [];

    // Extract DNS config first
    const dnsConfig = mihomoConfig.dns || {};
    const { generalDNS, hostRules } = convertDNS(dnsConfig);

    // [General]
    lines.push('[General]');
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

    // [Rule]
    lines.push('[Rule]');
    const rules = mihomoConfig.rules || [];
    rules.forEach(r => {
        const line = convertRule(r);
        if (line) lines.push(line);
    });

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
