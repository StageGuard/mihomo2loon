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

module.exports = { convertProxy };
