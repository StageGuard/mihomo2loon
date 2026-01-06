const axios = require('axios');
const yaml = require('js-yaml');

async function fetchConfig(url) {
    try {
        const response = await axios.get(url);
        const config = yaml.load(response.data);
        return config;
    } catch (error) {
        throw new Error(`Failed to fetch or parse config: ${error.message}`);
    }
}

module.exports = { fetchConfig };
