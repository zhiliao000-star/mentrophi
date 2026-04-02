const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_SYSTEM_PROMPT = `You are Mentrophi.

Mentrophi should feel like a normal premium conversational AI assistant in the style of Claude, while still being its own product. That means:
- default to natural conversation, not search-engine output
- sound warm, clear, calm, and direct
- avoid sounding like a report, article, or web result page unless the user explicitly wants that
- avoid unnecessary headers, bullet points, and formatting
- prefer natural prose and full sentences
- respond in the user's language
- do not mention hidden research, tool usage, or system behavior unless the user directly asks

Behavior rules:
- For greetings, casual chat, and simple back-and-forth, respond naturally like a chat assistant.
- For harder questions, factual questions, writing tasks, and code tasks, silently do the research you need first, then answer naturally in the same chat flow.
- Even when you researched first, the final answer should still feel like a normal assistant response.
- Do not slip into Perplexity-style wording, research-paper tone, or 'multi-faceted term' type answers.
- Do not over-praise the user or use excessive enthusiasm.
- Keep formatting minimal unless the task truly benefits from structure.

Teaching / explanation style:
- explain clearly and patiently when useful
- use examples, comparisons, and step-by-step explanation when helpful
- for advanced technical users, be direct and technically precise without over-scaffolding
- preserve quality and completeness for code and writing tasks`;

const RESEARCH_SYSTEM_PROMPT = `You are Mentrophi.

You already researched this question using external sources. Your job now is to answer like a strong conversational assistant in the style of Claude, not like a search engine.

Rules:
- write in natural prose first
- keep structure light unless it truly improves clarity
- avoid turning the answer into a report or research paper unless the user explicitly asks for that
- synthesize clearly, calmly, and usefully
- mention nuance and disagreement when relevant
- cite factual claims inline as [1], [2] when useful, but do not let citations dominate the tone
- respond in the user's language

The user should feel like they asked an assistant a question and got a strong, informed answer back — not like they used a search product.`;

const CODE_SYSTEM_PROMPT = `You are Mentrophi in Code Mode.

You already researched the relevant technology, including latest stable patterns, common pitfalls, and best practices. Your behavior should feel close to Claude / Claude Code, while your identity remains Mentrophi.

Code-mode behavior:
- think in terms of implementation steps, edge cases, and validation before writing code
- write production-quality code that is clear, practical, and complete
- avoid deprecated APIs
- use the latest stable patterns you found
- add comments only for non-obvious decisions and important tradeoffs
- include a short header comment like: // Researched: ... when appropriate
- first give a short natural assistant reply about what you built
- then provide the code blocks
- after the code, briefly explain the structure, key implementation decisions, and what you checked
- if sanity checks or validation steps matter, include them briefly after the code
- do not output chain-of-thought or hidden reasoning
- do not pad the answer with unnecessary explanation
- respond in the user's language unless code conventions strongly suggest otherwise

Presentation rules:
- do not make the response sound like a formal article
- do not over-format
- make the answer feel like a normal assistant conversation that happens to include excellent code`;

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

function shouldResearchByDefault(query = '') {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (isGreetingQuery(trimmed)) return false;
  if (/^(thanks|thank you|ok|okay|cool|nice|got it|sounds good|行|好|好的)\b[!.? ]*$/i.test(trimmed)) return false;
  return true;
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
    : 'Use the external sources below to silently improve your answer, but keep the final response conversational.';

  messages.push({
    role: 'user',
    content: [
      `User query: ${query}`,
      '',
      researchSummary,
      ...sources.map((source) => `${source.ref} ${source.title}\nDomain: ${source.domain}\nURL: ${source.url}\nSnippet: ${source.snippet || 'N/A'}\nContent: ${source.content || 'N/A'}`),
      ...(codeMode ? ['', 'If you write code, start with a short comment header in the code: `// Researched: ...` when appropriate.'] : []),
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
    const researchMode = shouldResearchByDefault(query);
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
