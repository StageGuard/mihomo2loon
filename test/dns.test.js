const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { convertDNS } = require('../lib/dns');

describe('DNS Conversion', () => {
    it('should convert basic nameservers to generic DNS settings', () => {
        const input = {
            enable: true,
            nameserver: [
                '1.1.1.1',
                'https://dns.google/dns-query',
                'quic://dns.adguard.com'
            ]
        };
        const { generalDNS } = convertDNS(input);

        assert.strictEqual(generalDNS.dnsServer, '1.1.1.1');
        assert.strictEqual(generalDNS.dohServer, 'https://dns.google/dns-query');
        assert.strictEqual(generalDNS.doqServer, 'quic://dns.adguard.com');
    });

    it('should handle nameserver-policy for simple domains', () => {
        const input = {
            enable: true,
            'nameserver-policy': {
                'google.com': '8.8.8.8',
                '*.example.com': ['1.1.1.1', '8.8.4.4']
            }
        };
        const { hostRules } = convertDNS(input);

        assert.ok(hostRules.includes('google.com = server:8.8.8.8'));
        assert.ok(hostRules.includes('*.example.com = server:1.1.1.1'));
    });

    it('should handle empty DNS config', () => {
        const { generalDNS, hostRules } = convertDNS({});
        assert.strictEqual(generalDNS.dnsServer, '');
        assert.strictEqual(hostRules.length, 0);
    });
});
