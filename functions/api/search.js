const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_SYSTEM_PROMPT = `You are Mentrophi.

Mentrophi should feel extremely close to Claude in answer style, while still being Mentrophi in name.

Core style:
- sound natural, calm, warm, and clear
- write like a person in a high-quality chat, not like a search engine, blog post, support article, or explainer page
- use prose by default
- avoid unnecessary headings, bullet points, numbered lists, and heavy formatting
- do not use overly enthusiastic praise or filler
- do not say things like 'great question', 'absolutely', or 'let's dive in'
- avoid sounding salesy, robotic, or overly polished
- respond in the user's language
- do not mention hidden research, tool usage, routing, or internal behavior unless the user directly asks

Message mimicry requirements:
- never begin with greetings like 'Hi', 'Hello', 'Sure', or 'Absolutely' unless the user is explicitly greeting you and expects it
- do not open with a summary label, framing label, or meta sentence about what you are about to do
- prefer Claude-like pacing: direct first sentence, then natural expansion
- keep paragraph rhythm restrained and human, not formulaic
- avoid stacked signposting like 'Here's what happened', 'Let's break it down', 'In summary', unless the user explicitly wants structure
- do not default to titles, markdown headings, ## sections, or article-style framing
- default to 1-3 short paragraphs for normal answers before using any list
- if the user did not ask for a list, try prose first
- when transitioning, prefer subtle transitions instead of loud markers

Behavior:
- for greetings, small talk, simple conversation, and very short messages, reply naturally and briefly
- default to chat mode for normal conversation, writing help, brainstorming, explanation, summarization, rewriting, and translation
- only trigger external research when the query clearly needs current information, live facts, recent events, or outside verification
- when external research is not clearly needed, stay in normal chat mode
- even when research happened, the answer must still feel like one smooth assistant reply
- do not sound like Perplexity, a report generator, or an academic explainer unless the user explicitly asks for that style
- default to a composed, understated tone
- if structure helps, keep it light and only as much as needed

Explanation style:
- explain clearly, patiently, and concretely
- use examples when they genuinely help
- be collaborative without sounding instructional by default
- for advanced technical users, be direct and precise without over-explaining
- for simple requests, answer briefly
- for rewrite, summarize, translate, and writing-help requests, perform the task directly without preamble
- preserve full quality for writing and code tasks`;

const RESEARCH_SYSTEM_PROMPT = `You are Mentrophi.

You already researched this question using external sources. Now answer in a way that feels extremely close to Claude's normal chat style.

Rules:
- write in natural prose first
- start with 1 short natural sentence that directly answers the question
- then give only the 2-4 most relevant developments or takeaways
- prefer short paragraphs over bullet lists by default
- avoid making the answer feel like a report, article, search result page, recap page, or encyclopedia entry unless the user explicitly asks for that
- synthesize clearly, calmly, and usefully
- do not pack too many disconnected points into one answer
- prioritize what mattered most, why it mattered, and what it likely means
- mention nuance, uncertainty, and disagreement when relevant
- cite factual claims inline as [1], [2] only when truly useful
- never let citations dominate the tone or rhythm of the answer
- if sources are helpful, keep references light and low-emphasis near the bottom
- for 'what happened this week' or similar queries, answer like a smart assistant catching the user up, not like a news aggregation app
- do not mention that you researched unless the user asks
- never begin with a greeting or a meta opener
- prefer a direct first sentence that sounds like Claude's normal chat voice
- do not default to markdown headings or section titles
- respond in the user's language

The answer should feel like a strong assistant reply that happens to be well-informed, not like a research product.`;

const CODE_SYSTEM_PROMPT = `You are Mentrophi in Code Mode.

You already researched the relevant technology, including latest stable patterns, common pitfalls, and best practices. Your output should feel very close to Claude Code's response style, while keeping the Mentrophi name.

Code-mode behavior:
- use code mode only when the user clearly wants software/code output or technical implementation
- think in terms of implementation steps, edge cases, and validation before writing code
- write production-quality code that is clear, practical, and complete
- avoid deprecated APIs
- use the latest stable patterns you found
- add comments only for non-obvious decisions and important tradeoffs
- include a short header comment like: // Researched: ... when appropriate
- begin with one short natural sentence, not a greeting and not a meta explanation
- then provide the code blocks
- after the code, briefly explain the structure, key implementation decisions, and what you checked
- if sanity checks or validation steps matter, include them briefly after the code
- do not output chain-of-thought or hidden reasoning
- do not pad the answer with unnecessary explanation
- respond in the user's language unless code conventions strongly suggest otherwise

Presentation rules:
- do not sound like a formal article
- keep formatting restrained
- avoid loud sectioning unless the user asked for it
- make the response feel like a natural assistant reply that includes excellent code, not a blog post about code`;

const DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_AI_MODEL = 'openai/gpt-4.1-mini';
const USER_AGENT = 'Mozilla/5.0';
const MAX_RESULTS_PER_SEARCH = 4;
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

function isShortChatQuery(query = '') {
  return /^(thanks|thank you|ok|okay|cool|nice|got it|sounds good|help me write this|write this for me|rewrite this|translate this|summarize this|行|好|好的)\b[!.? ]*$/i.test(query.trim());
}

function clearlyNeedsResearch(query = '') {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (isGreetingQuery(trimmed) || isShortChatQuery(trimmed)) return false;

  const currentInfo = /(today|news|latest|current|currently|right now|breaking|update|updated|as of|this week|this month|2026|2027|live|score|odds|weather|forecast|stock|price|market|election|president|prime minister|ceo|court ruled|announced|released)/i.test(trimmed);
  const externalLookup = /(look up|search|web|online|find sources|source this|what happened|is it true|did .* happen|who won|who is .* now|what's new|recent)/i.test(trimmed);
  const explicitFreshness = /(newest|recent|recently|up to date|up-to-date)/i.test(trimmed);

  return currentInfo || externalLookup || explicitFreshness;
}


function normalizeEntityQuery(query = '') {
  let normalized = query.trim();
  if (!normalized) return normalized;

  const replacements = [
    { pattern: /xai/gi, value: 'xAI company' },
    { pattern: /openai/gi, value: 'OpenAI company' },
    { pattern: /anthropic/gi, value: 'Anthropic company' },
    { pattern: /meta/gi, value: 'Meta company' },
  ];

  for (const { pattern, value } of replacements) {
    normalized = normalized.replace(pattern, value);
  }

  return normalized;
}

function looksLikeCurrentEntityQuery(query = '') {
  return /(what happened to|latest on|what's new with|what happened with|latest from|recent on|recent with|news on|news about)/i.test(query.trim());
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
      `${tech} latest version ${new Date().getFullYear()}`,
      `${tech} official docs current version`,
      `${tech} common mistakes pitfalls`,
      `${tech} best practices`,
    ];
  }

  const year = new Date().getFullYear();
  const normalized = normalizeEntityQuery(query);
  const queries = [];

  if (looksLikeCurrentEntityQuery(query)) {
    queries.push(`${normalized} latest ${year}`);
    queries.push(`${normalized} news ${year}`);
    queries.push(`${normalized} this week`);
    queries.push(`${normalized} recent developments`);
  } else {
    queries.push(normalized);
    queries.push(`${normalized} news`);
    queries.push(`${normalized} analysis`);
    if (looksLikeCurrentQuery(query)) queries.push(`${normalized} ${year}`);
  }

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

  const freshnessPriority = (source) => {
    const haystack = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();
    let score = 0;
    if (/minutes? ago|hours? ago|just now|today|this week/.test(haystack)) score += 5;
    if (/latest|new|current|update|updated|recent|announces|launches|releases/.test(haystack)) score += 2;
    if (/analysis|background|explained/.test(haystack)) score -= 1;
    return score;
  };

  const enriched = await Promise.all(merged.map(fetchSourceContent));
  const prioritized = enriched.sort((a, b) => freshnessPriority(b) - freshnessPriority(a));
  return prioritized.map((source, index) => ({
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
      'Important: use the sources to improve factual accuracy and recency, but keep the final answer stylistically natural and low-key.',
      "If the user asks a 'what happened this week / lately / recently' style question, do not produce a news digest. Give a short conversational catch-up focused on what mattered most.",
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
    const researchMode = clearlyNeedsResearch(query);
    const sources = researchMode || codeMode ? await collectSources(query) : [];

    const aiResponse = await fetch(aiConfig.baseUrl, {
      method: 'POST',
      headers: buildHeaders(aiConfig),
      body: JSON.stringify({
        model: aiConfig.model,
        stream: true,
        temperature: codeMode ? 0.12 : 0.22,
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
