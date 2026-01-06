const fs = require('fs');
const yaml = require('js-yaml');
const { convert } = require('./lib/converter');

const templatePath = 'docs/mihomo_config_template.yaml';

try {
    const fileContents = fs.readFileSync(templatePath, 'utf8');
    const config = yaml.load(fileContents);
    const loonConfig = convert(config);

    console.log('--- CONVERSION RESULT ---');
    console.log(loonConfig);
    console.log('--- END RESULT ---');

} catch (e) {
    console.error(e);
}
