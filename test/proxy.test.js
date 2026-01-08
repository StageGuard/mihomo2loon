const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { convertProxy } = require('../lib/proxy');

describe('Proxy Conversion', () => {
    it('should convert Shadowsocks proxy', () => {
        const input = {
            name: 'ss-node',
            type: 'ss',
            server: '1.2.3.4',
            port: 8388,
            cipher: 'aes-256-gcm',
            password: 'pass',
            udp: true
        };
        const result = convertProxy(input);
        assert.ok(result.includes('ss-node = Shadowsocks,1.2.3.4,8388,aes-256-gcm,"pass"'));
        assert.ok(result.includes('udp=true'));
    });

    it('should convert VLESS with Reality', () => {
        const input = {
            name: 'vless-reality',
            type: 'vless',
            server: 'example.com',
            port: 443,
            uuid: 'uuid-123',
            network: 'tcp',
            tls: true,
            servername: 'example.com',
            'reality-opts': {
                'public-key': 'pk123',
                'short-id': 'sid123'
            },
            'client-fingerprint': 'chrome'
        };
        const result = convertProxy(input);
        assert.ok(result.includes('vless-reality = VLESS,example.com,443,"uuid-123"'));
        assert.ok(result.includes('public-key=pk123'));
        assert.ok(result.includes('short-id=sid123'));
        assert.ok(result.includes('client-fingerprint=chrome'));
    });

    it('should convert Wireguard with peers', () => {
        const input = {
            name: 'wg-test',
            type: 'wireguard',
            ip: '10.0.0.2',
            'private-key': 'privkey',
            peers: [{
                server: '1.1.1.1',
                port: 51820,
                'public-key': 'pubkey',
                'allowed-ips': ['0.0.0.0/0']
            }]
        };
        const result = convertProxy(input);
        assert.ok(result.includes('wg-test = wireguard'));
        assert.ok(result.includes('interface-ip=10.0.0.2'));
        assert.ok(result.includes('private-key="privkey"'));
        // Check peers formatting roughly
        assert.ok(result.includes('peers=[{public-key="pubkey",allowed-ips="0.0.0.0/0",endpoint=1.1.1.1:51820}]'));
    });

    it('should return null for unknown types', () => {
        const result = convertProxy({ type: 'unknown-protocol', name: 'bad' });
        assert.strictEqual(result, null);
    });
});
