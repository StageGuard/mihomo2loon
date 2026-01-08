function convertGroup(g) {
    // Loon: Name = type, policies...

    // Convert proxies array to string
    // Mihomo: proxies: ['p1', 'p2'] works directly
    const proxies = g.proxies ? g.proxies.join(',') : '';

    const parts = [];
    const opts = [];

    switch (g.type) {
        case 'select':
            parts.push(`${g.name} = select`);
            parts.push(proxies);
            break;

        case 'url-test':
            parts.push(`${g.name} = url-test`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`); // Default url
            opts.push(`interval=${g.interval || 300}`);
            if (g.tolerance) opts.push(`tolerance=${g.tolerance}`);
            break;

        case 'fallback':
            parts.push(`${g.name} = fallback`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`);
            opts.push(`interval=${g.interval || 300}`);
            break;

        case 'load-balance':
            parts.push(`${g.name} = load-balance`);
            parts.push(proxies);
            opts.push(`url=${g.url || 'http://www.gstatic.com/generate_204'}`);
            opts.push(`interval=${g.interval || 300}`);
            // algorithm mapping
            // Mihomo: consistent-hashing, round-robin
            // Loon: PCC, Round-Robin, Random
            if (g.strategy === 'consistent-hashing') opts.push(`algorithm=PCC`);
            else if (g.strategy === 'round-robin') opts.push(`algorithm=Round-Robin`);
            else opts.push(`algorithm=Random`);
            break;

        default:
            // Map unknowns to select to be safe
            parts.push(`${g.name} = select`);
            parts.push(proxies);
            break;
    }

    return parts.join(',') + (opts.length > 0 ? ',' + opts.join(',') : '');
}

module.exports = { convertGroup };
