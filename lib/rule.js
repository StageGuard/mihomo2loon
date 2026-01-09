const { expandGeosite, getGeositeDomains } = require('./geosite');

// Helper to map Mihomo rule types to Loon rule types
const ruleTypeMap = {
    'DOMAIN': 'DOMAIN',
    'DOMAIN-SUFFIX': 'DOMAIN-SUFFIX',
    'DOMAIN-KEYWORD': 'DOMAIN-KEYWORD',
    'GEOIP': 'GEOIP',
    'IP-CIDR': 'IP-CIDR',
    'IP-CIDR6': 'IP-CIDR6',
    'SRC-IP-CIDR': 'SRC-IP-CIDR',
    'PROCESS-NAME': 'PROCESS-NAME',
    'MATCH': 'FINAL',
    'GEOSITE': 'GEOSITE',
    'NETWORK': 'PROTOCOL', // Map NETWORK -> PROTOCOL? Loon Docs: PROTOCOL,UDP,PROXY
    'DST-PORT': 'DEST-PORT',
    'SRC-PORT': 'SRC-PORT'
};

// AST Logic Rule Parser
class LogicRuleParser {
    constructor(input) {
        this.input = input;
        this.tokens = this.tokenize(input);
        this.tokenIdx = 0;
    }

    tokenize(input) {
        const tokens = [];
        let current = 0;
        while (current < input.length) {
            let char = input[current];

            if (char === '(') {
                tokens.push({ type: 'LPAREN', value: '(' });
                current++;
                continue;
            }
            if (char === ')') {
                tokens.push({ type: 'RPAREN', value: ')' });
                current++;
                continue;
            }
            if (char === ',') {
                tokens.push({ type: 'COMMA', value: ',' });
                current++;
                continue;
            }
            if (/\s/.test(char)) {
                current++;
                continue;
            }

            // Identifier
            let value = '';
            while (current < input.length && !['(', ')', ','].includes(input[current])) {
                value += input[current];
                current++;
            }
            value = value.trim();
            if (value) {
                tokens.push({ type: 'IDENTIFIER', value });
            }
        }
        return tokens;
    }

    peek() {
        return this.tokens[this.tokenIdx];
    }

    consume(type) {
        const token = this.tokens[this.tokenIdx];
        if (token && (type ? token.type === type : true)) {
            this.tokenIdx++;
            return token;
        }
        return null;
    }

    expect(type) {
        const token = this.consume(type);
        if (!token) {
            throw new Error(`Expected ${type} at index ${this.tokenIdx}, found ${this.peek()?.type}`);
        }
        return token;
    }

    parse() {
        // Top level: TYPE, PAYLOAD, TARGET (Mihomo Logic Rule)
        // OR Atom: TYPE, VALUE, TARGET

        const typeToken = this.expect('IDENTIFIER');
        const ruleType = typeToken.value.toUpperCase();

        this.expect('COMMA');

        let payload = null;
        let value = null;
        let target = null;
        let isLogic = false;

        if (this.isLogicType(ruleType)) {
            isLogic = true;
            payload = this.parsePayload();
        } else {
            // Atomic Rule
            const valToken = this.expect('IDENTIFIER');
            value = valToken.value;
        }

        // Target (if present)
        if (this.peek()?.type === 'COMMA') {
            this.consume('COMMA');
            const targetToken = this.consume('IDENTIFIER');
            target = targetToken?.value;
        }

        // Handle extras for atomic? (like no-resolve)
        const extra = [];
        while (this.peek()?.type === 'COMMA') {
            this.consume('COMMA');
            const t = this.consume('IDENTIFIER');
            if (t) extra.push(t.value);
        }

        return {
            type: ruleType,
            payload,
            value,
            target,
            isLogic,
            extra
        };
    }

    parsePayload() {
        // Payload: ((SubRules)) -> Outer parens contain list of (SubRule)
        this.expect('LPAREN');

        const subRules = [];
        while (true) {
            // (SubRule)
            this.expect('LPAREN');
            subRules.push(this.parseSubRule());
            this.expect('RPAREN');

            if (this.peek()?.type === 'COMMA') {
                this.consume('COMMA');
            } else {
                break;
            }
        }

        this.expect('RPAREN');
        return subRules;
    }

    parseSubRule() {
        // SubRule: TYPE, VALUE or LOGIC_TYPE, PAYLOAD
        const typeToken = this.expect('IDENTIFIER');
        const ruleType = typeToken.value.toUpperCase();

        this.expect('COMMA');

        if (this.isLogicType(ruleType)) {
            // Logic SubRule: AND,((...)) - Payload follows
            const payload = this.parsePayload();
            return { type: ruleType, payload, isLogic: true };
        } else {
            const valToken = this.expect('IDENTIFIER');
            return { type: ruleType, value: valToken.value, isLogic: false };
        }
    }

    isLogicType(type) {
        return ['AND', 'OR', 'NOT'].includes(type);
    }

    generateLoon(node) {
        const loonType = ruleTypeMap[node.type] || node.type;

        if (node.isLogic) {
            const subs = node.payload.map(child => `(${this.generateLoon(child)})`).join(',');
            const targetStr = node.target ? `,${node.target}` : '';
            return `${loonType},(${subs})${targetStr}`;
        } else {
            // Atomic
            if (node.type === 'GEOSITE') {
                // Expand GEOSITE into OR(d1, d2, ...)
                // getGeositeDomains returns [{type, value}, ...]
                try {
                    const domains = getGeositeDomains(node.value);
                    if (domains.length === 0) {
                        return `# Skipped empty GEOSITE in logic: ${node.value}`;
                    } else if (domains.length === 1) {
                        // Single domain, just return it
                        const d = domains[0];
                        const lType = ruleTypeMap[d.type] || d.type;
                        return `(${lType},${d.value})`;
                    } else {
                        // Multiple domains -> OR((...),(...))
                        const subs = domains.map(d => {
                            const lType = ruleTypeMap[d.type] || d.type;
                            return `(${lType},${d.value})`;
                        }).join(',');
                        return `OR,(${subs})`; // No target for nested logic
                    }
                } catch (e) {
                    return `# Error expanding GEOSITE in logic (${node.value}): ${e.message}`;
                }
            }

            let res = `${loonType},${node.value}`;
            if (node.target) res += `,${node.target}`; // Only for top level atomic
            if (node.extra && node.extra.length > 0) res += `,${node.extra.join(',')}`;

            return res;
        }
    }
}

function convertRule(r) {
    if (typeof r !== 'string') return null;
    const cleanR = r.trim();

    // Check for Logic Rules
    if (cleanR.startsWith('AND,') || cleanR.startsWith('OR,') || cleanR.startsWith('NOT,')) {
        try {
            const parser = new LogicRuleParser(cleanR);
            const ast = parser.parse();
            return parser.generateLoon(ast);
        } catch (e) {
            return `# Error converting logic rule: ${e.message} | Input: ${r}`;
        }
    }

    // Existing atomic rule logic
    const parts = cleanR.split(',').map(s => s.trim());
    const type = parts[0].toUpperCase();
    const value = parts[1];
    const target = parts[2];
    const extra = parts.length > 3 ? `,${parts.slice(3).join(',')}` : '';

    const loonType = ruleTypeMap[type];

    if (type === 'MATCH') {
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
        return `${loonType},${value},${target}${extra}`;
    }

    if (parts.length >= 3) {
        return `${type},${value},${target}${extra}`;
    }

    return `# Unknown rule: ${r}`;
}

function parseRule(r) {
    if (typeof r !== 'string') return null;
    const cleanR = r.trim();

    // Check type
    const parts = cleanR.split(',').map(s => s.trim());
    if (parts.length < 2) return null;

    return {
        type: parts[0].toUpperCase(),
        value: parts[1],
        target: parts[2], // Might be optional
        original: cleanR
    };
}

module.exports = { convertRule, parseRule };

