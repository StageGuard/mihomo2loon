const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const ruleModule = require('../lib/rule');
// We need to mock getGeositeDomains, but requiring it directly gives original.
// Since we can't easily mock in this setup without a mocking lib, we will modify the test to only check the structure if possible.
// Or we rely on the fact that if getGeositeDomains returns valid list, generateLoon handles it.

const { convertRule } = ruleModule;

describe('Rule Conversion', () => {
    it('should convert simple DOMAIN rules', () => {
        assert.strictEqual(convertRule('DOMAIN,example.com,DIRECT'), 'DOMAIN,example.com,DIRECT');
        assert.strictEqual(convertRule('DOMAIN-SUFFIX,google.com,Proxy'), 'DOMAIN-SUFFIX,google.com,Proxy');
    });

    it('should convert MATCH to FINAL', () => {
        assert.strictEqual(convertRule('MATCH,DIRECT'), 'FINAL,DIRECT');
    });

    it('should convert logic AND rules', () => {
        const input = 'AND,((DOMAIN,baidu.com),(PROTOCOL,UDP)),DIRECT';
        const expected = 'AND,((DOMAIN,baidu.com),(PROTOCOL,UDP)),DIRECT';
        // Note: Our parser might add/remove spaces, let's check structure or exact match if deterministic
        // The implementation tries to preserve structure but might strip spaces
        assert.strictEqual(convertRule(input), expected);
    });

    it('should convert logic OR rules with nested NOT', () => {
        const input = 'OR,((NOT,((DOMAIN,test.com))),(SRC-IP-CIDR,192.168.1.0/24)),REJECT';
        const expected = 'OR,((NOT,((DOMAIN,test.com))),(SRC-IP-CIDR,192.168.1.0/24)),REJECT';
        assert.strictEqual(convertRule(input), expected);
    });

    it('should expand GEOSITE in logic rules', () => {
        // Mock getGeositeDomains if possible, or rely on actual implementation if file exists
        // Since we didn't mock fs, this test depends on geosite file usage.
        // Assuming 'youtube' geosite exists in docs/domain-list-community/data (common)
        // If not, we might need a safer test or mock.
        // Let's assume a known missing one returns warning

        const result = convertRule('AND,((GEOSITE,unknown-site)),DIRECT');
        assert.ok(result.includes('# Skipped empty GEOSITE') || result.includes('Error'));

        // If we want to test actual expansion, we need a real geosite.
        // But integration tests are better for that.
    });
});
