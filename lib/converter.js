const { expandGeosite, getGeositeDomains } = require('./geosite');

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

function convertProxy(p) {
    const parts = [];
    const commonOpts = [];

    // Helper to push key=value if value exists
    const addOpt = (key, val) => {
        if (val !== undefined && val !== null && val !== '') {
            commonOpts.push(`${key}=${val}`);
        }
    };

    // Common conversions
    if (p.udp) addOpt('udp', 'true');
    if (p['skip-cert-verify']) addOpt('skip-cert-verify', 'true');
    if (p.tfo) addOpt('fast-open', 'true'); // tfo in clash -> fast-open

    switch (p.type) {
        case 'ss':
            // ss = Shadowsocks,server,port,method,password
            parts.push(`${p.name} = Shadowsocks`);
            parts.push(p.server);
            parts.push(p.port);
            parts.push(p.cipher);
            parts.push(`"${p.password}"`);
            // Plugin support (obfs, v2ray-plugin) is complex, handling simple case first
            if (p.plugin === 'obfs') {
                addOpt('obfs-host', p['plugin-opts']?.host);
                addOpt('obfs-name', p['plugin-opts']?.mode); // http/tls
            }
            break;

        case 'socks5':
            // socks5 = socks5,server,port,username,password
            parts.push(`${p.name} = Socks5`);
            parts.push(p.server);
            parts.push(p.port);
            if (p.username) parts.push(p.username);
            if (p.password) parts.push(`"${p.password}"`);
            if (p.tls) addOpt('tls', 'true');
            break;

        case 'http':
            // http = http,server,port,username,password
            parts.push(`${p.name} = http`);
            parts.push(p.server);
            parts.push(p.port);
            if (p.username) parts.push(p.username);
            if (p.password) parts.push(`"${p.password}"`);
            if (p.tls) addOpt('over-tls', 'true');
            break;

        case 'vmess':
            // vmess = vmess,server,port,encryption,uuid
            parts.push(`${p.name} = vmess`);
            parts.push(p.server);
            parts.push(p.port);
            parts.push(p.cipher || 'auto');
            parts.push(`"${p.uuid}"`);

            if (p.network) addOpt('transport', p.network); // ws, tcp, http, grpc
            if (p.tls) addOpt('over-tls', 'true');
            if (p.servername) addOpt('tls-name', p.servername);

            // WS opts
            if (p['ws-opts']) {
                addOpt('path', p['ws-opts'].path);
                const headers = p['ws-opts'].headers;
                if (headers && headers.Host) addOpt('host', headers.Host);
            }
            // HTTP opts
            if (p['http-opts']) {
                // complex array paths not fully supported in simple conversion, take first
                if (Array.isArray(p['http-opts'].path) && p['http-opts'].path.length > 0) {
                    addOpt('path', p['http-opts'].path[0]);
                }
                if (p['http-opts'].headers && p['http-opts'].headers.Host) {
                    addOpt('host', Array.isArray(p['http-opts'].headers.Host) ? p['http-opts'].headers.Host[0] : p['http-opts'].headers.Host);
                }
            }
            // GRPC opts
            if (p['grpc-opts']) {
                addOpt('service-name', p['grpc-opts']['grpc-service-name']);
            }
            break;

        case 'vless':
            // VLESS = VLESS,server,port,uuid
            parts.push(`${p.name} = VLESS`);
            parts.push(p.server);
            parts.push(p.port);
            parts.push(`"${p.uuid}"`);

            if (p.network) addOpt('transport', p.network);
            if (p.tls) addOpt('over-tls', 'true');
            if (p.servername) addOpt('tls-name', p.servername);
            if (p.flow) addOpt('flow', p.flow); // xtls-rprx-vision

            // WS/GRPC opts similar to vmess
            if (p['ws-opts']) {
                addOpt('path', p['ws-opts'].path);
                if (p['ws-opts'].headers?.Host) addOpt('host', p['ws-opts'].headers.Host);
            }
            if (p['grpc-opts']) {
                addOpt('service-name', p['grpc-opts']['grpc-service-name']);
            }
            if (p['reality-opts']) {
                // Fix: Loon uses public-key and short-id directly
                addOpt('public-key', p['reality-opts']['public-key']);
                addOpt('short-id', p['reality-opts']['short-id']);
            }
            if (p['client-fingerprint']) addOpt('client-fingerprint', p['client-fingerprint']);
            break;

        case 'hysteria2':
            // hysteria2Node = Hysteria2,server,port,password,...
            parts.push(`${p.name} = Hysteria2`);
            parts.push(p.server);
            parts.push(p.port);
            if (p.password) parts.push(`"${p.password}"`);

            if (p.sni) addOpt('sni', p.sni);
            if (p.obfs) addOpt('salamander-password', p.obfs); // Mihomo obfs usually maps to salamander-password if it's that type?
            // Hysteria2 in Mihomo -> "obfs-password" sometimes?
            if (p['obfs-password']) addOpt('salamander-password', p['obfs-password']);
            break;

        case 'wireguard':
            // wireguardNode = wireguard,interface-ip=...,peers=[{...}]
            parts.push(`${p.name} = wireguard`);
            // Loon specific params
            if (p.ip) addOpt('interface-ip', p.ip);
            if (p.ipv6) addOpt('interface-ipV6', p.ipv6);
            if (p['private-key']) addOpt('private-key', `"${p['private-key']}"`);
            if (p.mtu) addOpt('mtu', p.mtu);

            // DNS in WG
            if (p.dns && Array.isArray(p.dns)) {
                if (p.dns.length > 0) addOpt('dns', p.dns[0]);
            }

            // Peers
            if (p.peers && p.peers.length > 0) {
                // Loon expects peers=[{public-key="...",endpoint=...}]
                // Mihomo peers: [{server, port, public-key, preshared-key, allowed-ips}]
                const peerObjs = p.peers.map(peer => {
                    const obj = {};
                    if (peer['public-key']) obj['public-key'] = `"${peer['public-key']}"`;
                    if (peer['preshared-key']) obj['preshared-key'] = `"${peer['preshared-key']}"`;
                    if (peer['allowed-ips']) obj['allowed-ips'] = `"${Array.isArray(peer['allowed-ips']) ? peer['allowed-ips'].join(',') : peer['allowed-ips']}"`;
                    if (peer.server && peer.port) obj.endpoint = `${peer.server}:${peer.port}`;
                    return obj;
                });

                // Format as string: props need to be formatted carefully
                // Loon example: peers=[{public-key="...",...}]
                // We construct the string manually to match Loon's format
                const peersStr = peerObjs.map(obj => {
                    const props = Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(',');
                    return `{${props}}`;
                }).join(',');

                parts.push(`peers=[${peersStr}]`);
            }
            break;

        case 'trojan':
            // trojan = trojan,server,port,password
            parts.push(`${p.name} = trojan`);
            parts.push(p.server);
            parts.push(p.port);
            parts.push(`"${p.password}"`);
            if (p.sni) addOpt('tls-name', p.sni);
            if (p.alpn) {
                // alpn is array in mihomo, loon takes string? Manual says alpn=http/1.1
                // Let's join or take first safely
                const alpnVal = Array.isArray(p.alpn) ? p.alpn.join(',') : p.alpn;
                if (alpnVal) addOpt('alpn', alpnVal);
            }
            if (p['ws-opts']) {
                addOpt('transport', 'ws');
                addOpt('path', p['ws-opts'].path);
                if (p['ws-opts'].headers?.Host) addOpt('host', p['ws-opts'].headers.Host);
            }
            break;

        // Add other types as needed (hysteria2, wireguard, etc.)

        default:
            return null;
    }

    return parts.join(',') + (commonOpts.length > 0 ? ',' + commonOpts.join(',') : '');
}

function convertGroup(g) {
    // Loon: Name = type, policies...

    // Convert proxies array to string
    // Mihomo: proxies: ['p1', 'p2'] works directly
    const proxies = g.proxies ? g.proxies.join(',') : '';

    const parts = [];
    const opts = [];

    switch (g.type) {
        case 'select':
            parts.push(`${g.name} = select`);
            parts.push(proxies);
            break;

        case 'url-test':
            parts.push(`${g.name} = url-test`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`); // Default url
            opts.push(`interval=${g.interval || 300}`);
            if (g.tolerance) opts.push(`tolerance=${g.tolerance}`);
            break;

        case 'fallback':
            parts.push(`${g.name} = fallback`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`);
            opts.push(`interval=${g.interval || 300}`);
            break;

        case 'load-balance':
            parts.push(`${g.name} = load-balance`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`);
            opts.push(`interval=${g.interval || 300}`);
            // algorithm mapping
            // Mihomo: consistent-hashing, round-robin
            // Loon: PCC, Round-Robin, Random
            if (g.strategy === 'consistent-hashing') opts.push(`algorithm=PCC`);
            else if (g.strategy === 'round-robin') opts.push(`algorithm=Round-Robin`);
            else opts.push(`algorithm=Random`);
            break;

        default:
            // Map unknowns to select to be safe
            parts.push(`${g.name} = select`);
            parts.push(proxies);
            break;
    }

    return parts.join(',') + (opts.length > 0 ? ',' + opts.join(',') : '');
}

function convertRule(r) {
    // Mihomo: "DOMAIN-SUFFIX,google.com,Proxy" (can be string or array in simplified yaml or object)
    // Assuming standard string list from simple yaml
    // if raw string:
    if (typeof r === 'string') {
        const parts = r.split(',').map(s => s.trim());
        const type = parts[0].toUpperCase();
        const value = parts[1];
        const target = parts[2]; // Proxy or Group name or DIRECT/REJECT

        // Map types
        const typeMap = {
            'DOMAIN': 'DOMAIN',
            'DOMAIN-SUFFIX': 'DOMAIN-SUFFIX',
            'DOMAIN-KEYWORD': 'DOMAIN-KEYWORD',
            'GEOIP': 'GEOIP',
            'IP-CIDR': 'IP-CIDR',
            'IP-CIDR6': 'IP-CIDR6',
            'SRC-IP-CIDR': 'SRC-IP-CIDR',
            'PROCESS-NAME': 'PROCESS-NAME', // Not always supported in simplified Loon configs? Loon supports User-Agent usually
            'MATCH': 'FINAL',
            'GEOSITE': 'GEOSITE' // Special handling
        };

        const loonType = typeMap[type];

        if (type === 'MATCH') {
            // Fix: For MATCH, the target is parts[1]
            return `FINAL,${value}`;
        }

        if (type === 'GEOSITE') {
            const rules = expandGeosite(value, target);
            if (rules.length > 0) {
                return rules.join('\n');
            } else {
                return `# GEOSITE: ${value} (Empty or File Not Found)`;
            }
        }

        if (loonType) {
            // Check for no-resolve option (sometimes "IP-CIDR,x.x.x.x/x,Proxy,no-resolve")
            const extra = parts.length > 3 ? `,${parts.slice(3).join(',')}` : '';
            return `${loonType},${value},${target}${extra}`;
        }

        // Return raw if unknown? Or comment out?
        return `# Unknown rule: ${r}`;
    }
    return null;
}

module.exports = { convert };
