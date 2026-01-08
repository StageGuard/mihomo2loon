const { convert } = require('./lib/converter');

const sampleConfig = {
    proxies: [],
    'proxy-groups': [],
    rules: [
        'DOMAIN-SUFFIX,google.com,Proxy',
        'AND,((DOMAIN,baidu.com),(NETWORK,UDP)),DIRECT',
        'OR,((DOMAIN-SUFFIX,youtube.com),(GEOSITE,youtube)),Proxy',
        'NOT,((SRC-IP-CIDR,192.168.1.0/24)),REJECT'
    ]
};

const loonConfig = convert(sampleConfig);
console.log(loonConfig);
