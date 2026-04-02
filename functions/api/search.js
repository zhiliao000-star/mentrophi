const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_SYSTEM_PROMPT = `You are Mentrophi, a premium conversational AI assistant. You are not a search engine UI and you should not sound like a research paper by default.

Your default mode is natural chat in the style of a thoughtful, high-end conversational assistant. Be warm, concise, and clear. Use full sentences and natural prose. Avoid over-formatting. Do not default to headers, bullets, or article structure unless the user asks for it or the task genuinely benefits from structure.

Adopt these style rules:
- Keep a warm, direct, helpful tone.
- In normal conversation, respond like a person chatting, not like an encyclopedia or search result page.
- Avoid unnecessary preamble and avoid excessive pleasantries.
- Prefer prose over lists unless the user asks for lists or lists are clearly necessary.
- If teaching or explaining, be clear and collaborative. Use examples and step-by-step explanation when helpful.
- For advanced technical questions, match the user's level and be direct.
- For writing, code, or technical content, preserve full quality and completeness.
- Respond in the same language as the user.

If the user is just greeting you, making small talk, or chatting casually, answer naturally without mentioning research or external sources.`;
const RESEARCH_SYSTEM_PROMPT = `You are Mentrophi, a premium conversational AI assistant that has already researched this question using external sources.

Important behavior:
- Even after researching, answer like a natural assistant in a chat conversation, not like a search engine and not like an academic paper unless the user explicitly wants that.
- Synthesize what you learned into a clean, helpful answer in natural prose.
- Use structure only when it genuinely improves clarity.
- Cite factual claims inline as [1], [2] when useful, but do not let citations dominate the tone.
- If sources disagree, explain the disagreement clearly and calmly.
- Prefer clear explanations, practical takeaways, and nuance over article-style formatting.
- Respond in the user's language.

Your goal is to feel like an AI assistant who quietly did the research first, then came back with a strong answer.`;
const CODE_SYSTEM_PROMPT = `You are Mentrophi in Code Mode. You have already researched the relevant technology, including latest stable patterns, common pitfalls, and best practices.

Write production-quality code in a Claude-style assistant voice:
- be clear, practical, and complete
- avoid deprecated APIs
- use the latest stable patterns you found
- add comments for non-obvious decisions and important tradeoffs
- include a short header comment like: // Researched: ...
- first provide a natural assistant response that introduces what you built
- then provide the code blocks
- after the code, briefly explain the project structure and key implementation decisions in normal chat prose
- do not pad the answer with unnecessary explanation
- respond in the user's language unless code conventions strongly suggest otherwise`;

const DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_AI_MODEL = 'openai/gpt-4.1-mini';
const USER_AGENT = 'Mozilla/5.0';
const MAX_RESULTS_PER_SEARCH = 3;
const MAX_SOURCE_CHARS = 800;

function decodeHtml(value = '') {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&#x60;/g, '`')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(rawUrl = '') {
  const decoded = decodeHtml(rawUrl);
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (decoded.startsWith('//')) return `https:${decoded}`;
  return `https://${decoded.replace(/^\/+/, '')}`;
}

function safeHostname(url, fallback = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

function looksLikeCurrentQuery(query = '') {
  return /(today|news|latest|current|breaking|election|stock|score|war|conflict|president|minister|earthquake|hurricane|update|202\d|20\d\d)/i.test(query);
}

function isGreetingQuery(query = '') {
  return /^(hi|hello|hey|yo|sup|what'?s up|good morning|good afternoon|good evening|how are you|hiya|hola|你好|嗨|哈喽)\b[!.? ]*$/i.test(query.trim());
}

function isCodeQuery(query = '') {
  return /(write|build|create|code|function|script|implement|program|debug|refactor|api|component|app|endpoint|algorithm|sql|javascript|typescript|python|react|node|express|next\.js|html|css)/i.test(query);
}

function needsResearch(query = '') {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (isGreetingQuery(trimmed)) return false;
  if (
    trimmed.split(/\s+/).length <= 4
    && !looksLikeCurrentQuery(trimmed)
    && !/[?？]$/.test(trimmed)
    && !/\b(explain|what is|who is|why|how|when|where|compare|research|latest|news|current)\b/i.test(trimmed)
  ) {
    return false;
  }
  return isCodeQuery(trimmed)
    || looksLikeCurrentQuery(trimmed)
    || /\b(latest|news|current|today|research|sources|according to|compare|price|release date|version|documented|statistics|trend|update|fact check|recent)\b/i.test(trimmed)
    || /[?？]$/.test(trimmed);
}

function extractTechnology(query = '') {
  const patterns = [
    /\b(?:in|using|with|for)\s+([a-z0-9.+#\-\/ ]{2,40})/i,
    /\b(react|next\.js|vue|svelte|node(?:\.js)?|express|fastapi|django|flask|typescript|javascript|python|tailwind|supabase|postgres(?:ql)?|mysql|sqlite|cloudflare|workers|hono|astro|vite|electron|deno)\b/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) return match[1].trim();
    if (match?.[0]) return match[0].trim();
  }
  const words = query.split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(' ');
}

function buildSearchQueries(query) {
  if (isCodeQuery(query)) {
    const tech = extractTechnology(query);
    return [
      `${tech} latest version 2025`,
      `${tech} common mistakes pitfalls`,
      `${tech} best practices`,
    ];
  }

  const year = new Date().getFullYear();
  const queries = [query, `${query} news`, `${query} analysis`];
  if (looksLikeCurrentQuery(query)) queries.push(`${query} ${year}`);
  return [...new Set(queries)];
}

function extractSearchResults(html) {
  const blocks = [...html.matchAll(/<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  const results = [];

  for (const blockMatch of blocks) {
    const block = blockMatch[0];
    const titleMatch = block.match(/result__title[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const urlMatch = block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const title = decodeHtml(titleMatch[2]);
    const snippet = decodeHtml(snippetMatch?.[1] || snippetMatch?.[2] || '');
    const visibleUrl = decodeHtml(urlMatch?.[1] || '');
    const url = /^\/l\/\?uddg=/i.test(titleMatch[1])
      ? decodeURIComponent((titleMatch[1].match(/[?&]uddg=([^&]+)/i)?.[1] || '').replace(/\+/g, '%20'))
      : normalizeUrl(titleMatch[1]);

    if (!title || !url) continue;
    results.push({ title, snippet, url, displayUrl: visibleUrl || safeHostname(url, url) });
    if (results.length === MAX_RESULTS_PER_SEARCH) break;
  }

  return results;
}

async function runDuckDuckGoSearch(query) {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  return extractSearchResults(await response.text());
}

function extractPageText(html) {
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i);
  const candidate = mainMatch ? mainMatch[0] : html;
  return decodeHtml(candidate).slice(0, MAX_SOURCE_CHARS);
}

async function fetchSourceContent(source) {
  try {
    const response = await fetch(source.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) return { ...source, content: source.snippet || '' };
    const html = await response.text();
    const content = extractPageText(html) || source.snippet || '';
    return { ...source, content };
  } catch {
    return { ...source, content: source.snippet || '' };
  }
}

async function collectSources(query) {
  const searchQueries = buildSearchQueries(query);
  const searchResults = await Promise.all(searchQueries.map((q) => runDuckDuckGoSearch(q)));
  const merged = [];
  const seen = new Set();

  for (const resultSet of searchResults) {
    for (const result of resultSet) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      merged.push(result);
    }
  }

  const enriched = await Promise.all(merged.map(fetchSourceContent));
  return enriched.map((source, index) => ({
    ...source,
    index: index + 1,
    ref: `[${index + 1}]`,
    domain: safeHostname(source.url, source.displayUrl || source.url),
  }));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getAiConfig(env) {
  return {
    apiKey: firstNonEmpty(env.AI_API_KEY, env.API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_KEY, env.NVIDIA_API_KEY),
    baseUrl: firstNonEmpty(env.AI_BASE_URL, env.API_BASE_URL, env.OPENROUTER_BASE_URL, env.OPENROUTER_API_BASE, DEFAULT_AI_BASE_URL),
    model: firstNonEmpty(env.AI_MODEL, env.MODEL_ID, env.OPENROUTER_MODEL, DEFAULT_AI_MODEL),
    siteUrl: firstNonEmpty(env.AI_SITE_URL, env.CF_PAGES_URL),
    siteName: firstNonEmpty(env.AI_SITE_NAME, 'Mentrophi'),
  };
}

function buildHeaders(aiConfig) {
  const headers = {
    Authorization: `Bearer ${aiConfig.apiKey}`,
    'Content-Type': 'application/json',
  };

  if (/openrouter\.ai/i.test(aiConfig.baseUrl)) {
    if (aiConfig.siteUrl) headers['HTTP-Referer'] = aiConfig.siteUrl;
    if (aiConfig.siteName) headers['X-Title'] = aiConfig.siteName;
  }

  return headers;
}

function formatHistory(history, query, sources, codeMode, researchMode) {
  const safeHistory = Array.isArray(history) ? history : [];
  const systemPrompt = codeMode
    ? CODE_SYSTEM_PROMPT
    : researchMode
      ? RESEARCH_SYSTEM_PROMPT
      : DEFAULT_SYSTEM_PROMPT;
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const item of safeHistory) {
    if (!item || typeof item.role !== 'string' || typeof item.content !== 'string') continue;
    if (!['user', 'assistant', 'system'].includes(item.role)) continue;
    messages.push({ role: item.role, content: item.content });
  }

  if (!researchMode && !codeMode) {
    messages.push({ role: 'user', content: query });
    return messages;
  }

  const researchSummary = codeMode
    ? `Research checklist completed: latest stable version guidance, common pitfalls, and best practices for ${extractTechnology(query)}.`
    : 'Use all of the following source material in your synthesis:';

  messages.push({
    role: 'user',
    content: [
      `User query: ${query}`,
      '',
      researchSummary,
      ...sources.map((source) => `${source.ref} ${source.title}\nDomain: ${source.domain}\nURL: ${source.url}\nSnippet: ${source.snippet || 'N/A'}\nContent: ${source.content || 'N/A'}`),
      ...(codeMode ? ['', 'If you write code, start with a short comment header in the code: `// Researched: ...`'] : []),
    ].join('\n\n'),
  });

  return messages;
}

function sseData(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { query, history } = await request.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const aiConfig = getAiConfig(env);
    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key. Set AI_API_KEY, API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const codeMode = isCodeQuery(query);
    const researchMode = needsResearch(query);
    const sources = researchMode || codeMode ? await collectSources(query) : [];

    const aiResponse = await fetch(aiConfig.baseUrl, {
      method: 'POST',
      headers: buildHeaders(aiConfig),
      body: JSON.stringify({
        model: aiConfig.model,
        stream: true,
        temperature: codeMode ? 0.2 : 0.35,
        messages: formatHistory(history, query, sources, codeMode, researchMode),
      }),
    });

    if (!aiResponse.ok || !aiResponse.body) {
      const errorText = await aiResponse.text();
      throw new Error(`AI provider failed (${aiConfig.model} @ ${aiConfig.baseUrl}): ${aiResponse.status} ${errorText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData('meta', { codeMode, researchMode, model: aiConfig.model, provider: aiConfig.baseUrl })));
        if (researchMode || codeMode) {
          controller.enqueue(encoder.encode(sseData('sources', { sources })));
        }
        const reader = aiResponse.body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();

              if (payload === '[DONE]') {
                controller.enqueue(encoder.encode(sseData('done', { done: true })));
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) controller.enqueue(encoder.encode(sseData('chunk', { content: delta })));
              } catch {
                controller.enqueue(encoder.encode(sseData('error', { error: 'Failed to parse AI stream chunk.' })));
              }
            }
          }

          controller.enqueue(encoder.encode(sseData('done', { done: true })));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(sseData('error', { error: error.message || 'Streaming failed.' })));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
