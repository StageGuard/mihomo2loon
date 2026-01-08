const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { convertGroup } = require('../lib/group');

describe('Proxy Group Conversion', () => {
    it('should convert select group', () => {
        const input = {
            name: 'MyGroup',
            type: 'select',
            proxies: ['Node A', 'Node B']
        };
        const result = convertGroup(input);
        assert.strictEqual(result, 'MyGroup = select,Node A,Node B');
    });

    it('should convert url-test group with specific url', () => {
        const input = {
            name: 'Auto',
            type: 'url-test',
            proxies: ['A', 'B'],
            url: 'http://test.com',
            interval: 600
        };
        const result = convertGroup(input);
        assert.ok(result.startsWith('Auto = url-test,A,B'));
        assert.ok(result.includes('url=http://test.com'));
        assert.ok(result.includes('interval=600'));
    });

    it('should map unknown types to select', () => {
        const input = {
            name: 'WeirdGroup',
            type: 'custom-type',
            proxies: ['A']
        };
        const result = convertGroup(input);
        assert.strictEqual(result, 'WeirdGroup = select,A');
    });
});
