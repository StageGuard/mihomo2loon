const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { convertRule } = require('../lib/rule');

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

    it('should handle invalid logic rules gracefully', () => {
        const result = convertRule('AND,invalid-payload,DIRECT');
        assert.ok(result.startsWith('# Error') || result.startsWith('# Invalid'));
    });
});
