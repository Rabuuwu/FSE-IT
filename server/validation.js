export function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
export function trustProxyHops(value) {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) invalid('TRUST_PROXY_HOPS must be a non-negative integer');
    const hops = Number(value);
    if (!Number.isSafeInteger(hops)) invalid('TRUST_PROXY_HOPS must be a non-negative integer');
    return hops;
}
export function positiveId(value) {
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) invalid('Invalid identifier');
    return Number(value);
}
export function text(value, name, max, required = true) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid(`Invalid ${name}`);
    return value.trim();
}
export function validateCredentials(body) {
    const email = text(body?.email, 'email', 254).toLowerCase();
    const password = body?.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Invalid email');
    if (typeof password !== 'string' || password.length < 10 || new TextEncoder().encode(password).length > 72) invalid('Password must contain at least 10 characters and at most 72 UTF-8 bytes');
    return { email, password };
}
export function validateLogin(body) {
    const email = text(body?.email, 'email', 254).toLowerCase();
    if (typeof body?.password !== 'string' || !body.password || new TextEncoder().encode(body.password).length > 72) invalid('Invalid credentials');
    return { email, password: body.password };
}
export function materialInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Invalid material');
    const type = body.type;
    if (!['link', 'pdf', 'article', 'course'].includes(type)) invalid('Invalid material type');
    const title = text(body.title, 'title', 200);
    const description = text(body.description, 'description', 2000, false);
    const author = text(body.author, 'author', 200, false);
    if (body.published !== undefined && typeof body.published !== 'boolean') invalid('Invalid publication status');
    const published = body.published === true;
    let url = null;
    if (['link', 'pdf'].includes(type)) {
        try { const parsed = new URL(text(body.url, 'url', 2048)); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) invalid('Use an HTTPS URL without credentials'); url = parsed.href; }
        catch { invalid('Use an HTTPS URL without credentials'); }
    }
    const content = type === 'article' ? text(body.content, 'content', 200000) : null;
    if (!Array.isArray(body.tags) || body.tags.length > 20) invalid('Provide up to 20 tags');
    const tags = [...new Set(body.tags.map(tag => text(tag, 'tag', 40).toLowerCase()))].sort();
    let stages = [];
    if (type === 'course') {
        if (!Array.isArray(body.stages) || !body.stages.length || body.stages.length > 100) invalid('Provide 1–100 course stages');
        stages = body.stages.map(stage => ({ title: text(stage?.title, 'stage title', 200), content: text(stage?.content, 'stage content', 200000) }));
    }
    return { type, title, description, author, published, url, content, tags, stages };
}
export function listInput(query) {
    const page = query.page === undefined ? 1 : positiveId(query.page);
    const limit = query.limit === undefined ? 20 : positiveId(query.limit);
    if (limit > 100 || page > 100000) invalid('Pagination limit exceeded');
    const q = text(query.q, 'search', 200, false);
    const tag = text(query.tag, 'tag', 40, false).toLowerCase();
    const type = text(query.type, 'type', 20, false);
    if (type && !['link','pdf','article','course'].includes(type)) invalid('Invalid material type');
    return { page, limit, q, tag, type };
}
export function commentInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Invalid comment');
    return { body: text(body.body, 'comment', 2000) };
}
