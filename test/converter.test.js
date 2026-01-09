const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { convert } = require('../lib/converter');

describe('Full Converter Integration', () => {
    it('should generate a complete configuration', () => {
        const input = {
            'allow-lan': true,
            'ipv6': false,
            dns: {
                enable: true,
                nameserver: ['1.1.1.1'],
                'nameserver-policy': { 'google.com': '8.8.8.8' }
            },
            proxies: [{
                name: 'p1', type: 'ss', server: '1.1.1.1', port: 80, cipher: 'aes-128-gcm', password: 'pass'
            }],
            'proxy-groups': [{
                name: 'g1', type: 'select', proxies: ['p1']
            }],
            rules: [
                'DOMAIN,example.com,p1',
                'MATCH,DIRECT'
            ]
        };

        const result = convert(input);

        // Check Sections
        assert.ok(result.includes('[General]'));
        assert.ok(result.includes('[Proxy]'));
        assert.ok(result.includes('[Proxy Group]'));
        assert.ok(result.includes('[Rule]'));
        assert.ok(result.includes('[Host]'));

        // Check Content
        assert.ok(result.includes('allow-wifi-access = true'));
        assert.ok(result.includes('dns-server = 1.1.1.1'));
        assert.ok(result.includes('google.com = server:8.8.8.8'));
        assert.ok(result.includes('p1 = Shadowsocks'));
        assert.ok(result.includes('g1 = select,p1'));
        assert.ok(result.includes('DOMAIN,example.com,p1'));
        assert.ok(result.includes('FINAL,DIRECT'));
    });

    it('should append MITM config if provided', () => {
        const input = { rules: [] };
        const options = {
            mitm: {
                p12: 'base64data',
                passphrase: 'pass',
                hostnames: ['*.example.com']
            }
        };

        const result = convert(input, options);
        assert.ok(result.includes('[MITM]'));
        assert.ok(result.includes('ca-p12 = base64data'));
        assert.ok(result.includes('hostname = *.example.com'));
    });

    it('should generate Remote Rules for GEOSITEs', () => {
        const input = {
            rules: [
                'GEOSITE,google,Proxy',
                'GEOSITE,youtube,DIRECT',
                'DOMAIN,example.com,Proxy'
            ]
        };
        const options = {
            baseUrl: 'http://localhost:8080'
        };

        const result = convert(input, options);

        assert.ok(result.includes('[Remote Rule]'));
        assert.ok(result.includes('http://localhost:8080/geosite/google.list,policy=Proxy,enabled=true,tag=google'));
        assert.ok(result.includes('http://localhost:8080/geosite/youtube.list,policy=DIRECT,enabled=true,tag=youtube'));

        // Standard rule should remain in [Rule]
        assert.ok(result.includes('[Rule]'));
        assert.ok(result.includes('DOMAIN,example.com,Proxy'));

        // GEOSITE should NOT be in [Rule] (unless it was nested logic, which we skipped here)
        assert.ok(!result.match(/GEOSITE,google,Proxy/));
    });
});
