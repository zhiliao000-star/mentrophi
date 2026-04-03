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

const BUILDER_REVIEW_PROMPT = `You are Builder inside Mentrophi's Two-Agent Debate.

Your job is to propose the best response direction for the user's CURRENT message, respond to criticism, and improve the approach over multiple rounds.

Strict rules:
- stay tightly anchored to the user's current message
- do not invent a different topic, scenario, or problem
- if the current message is short or ambiguous, discuss the best interpretation and best response shape for that exact message
- make each turn concrete, useful, and forward-moving
- do not ask broad reset questions unless the user explicitly asked for clarification
- do not reveal chain-of-thought
- visible turns should be short, high-signal, and product-ready

Respond with JSON using exactly this shape:
{
  "text": "1-2 sentence builder turn written like a visible debate message about the user's current message",
  "state": "continue" | "converged"
}`;

const CRITIC_REVIEW_PROMPT = `You are Critic inside Mentrophi's Two-Agent Debate.

Your job is to challenge Builder's response direction for the user's CURRENT message, identify weak interpretations, vagueness, misreads, missing edge cases, and better alternatives over multiple rounds.

Strict rules:
- stay tightly anchored to the user's current message
- do not invent a different topic, scenario, or problem
- if the current message is short or ambiguous, critique whether Builder interpreted it well and whether the proposed response would feel useful
- push for specificity, fidelity to the user's wording, and real practical value
- do not reveal chain-of-thought
- visible turns should be short, high-signal, and product-ready

Respond with JSON using exactly this shape:
{
  "text": "1-2 sentence critic turn written like a visible debate message about the user's current message",
  "state": "continue" | "converged"
}`;

const DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_AI_MODEL = 'openai/gpt-4.1-mini';
const USER_AGENT = 'Mozilla/5.0';
const MAX_RESULTS_PER_SEARCH = 5;
const MAX_SOURCE_CHARS = 800;

const FINANCIAL_CONTEXT_RE = /\b(stock|share price|shares|fund|trust|etf|dividend|yield|ticker|nav|market cap|earnings|revenue estimate|price target)\b/i;

function getCurrentDateContext() {
  const now = new Date();
  const iso = now.toISOString();
  const ymd = iso.slice(0, 10);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  return { now, iso, ymd, year, month, day };
}

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
  const { year, month, day, ymd } = getCurrentDateContext();
  if (isCodeQuery(query)) {
    const tech = extractTechnology(query);
    return [
      `${tech} latest version ${year}`,
      `${tech} official docs current version ${ymd}`,
      `${tech} release notes ${year}`,
      `${tech} common mistakes pitfalls`,
      `${tech} best practices`,
    ];
  }

  const normalized = normalizeEntityQuery(query);
  const queries = [];

  if (looksLikeCurrentEntityQuery(query)) {
    queries.push(`${normalized} latest ${ymd}`);
    queries.push(`${normalized} news ${ymd}`);
    queries.push(`${normalized} this week ${year}`);
    queries.push(`${normalized} recent developments ${month}/${day}/${year}`);
    if (/xai/i.test(query) && !FINANCIAL_CONTEXT_RE.test(query)) {
      queries.push(`xAI company Elon Musk artificial intelligence latest ${ymd}`);
    }
  } else {
    queries.push(normalized);
    queries.push(`${normalized} news ${ymd}`);
    queries.push(`${normalized} analysis`);
    if (looksLikeCurrentQuery(query)) queries.push(`${normalized} ${ymd}`);
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
  const { year } = getCurrentDateContext();
  let searchQueries = buildSearchQueries(query);
  let searchResults = await Promise.all(searchQueries.map((q) => runDuckDuckGoSearch(q)));

  const allInitial = searchResults.flat();
  const needsXaiRetry = /xai/i.test(query) && !FINANCIAL_CONTEXT_RE.test(query) && !allInitial.some((r) => /xai|elon musk|artificial intelligence/i.test(`${r.title} ${r.snippet}`));
  if (needsXaiRetry) {
    const retryQueries = [
      `xAI company Elon Musk artificial intelligence latest ${year}`,
      `xAI company news this week ${year}`,
      `xAI artificial intelligence company recent developments`,
    ];
    const retryResults = await Promise.all(retryQueries.map((q) => runDuckDuckGoSearch(q)));
    searchQueries = [...searchQueries, ...retryQueries];
    searchResults = [...searchResults, ...retryResults];
  }

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
    if (/minutes? ago|hours? ago|just now|today|this week/.test(haystack)) score += 7;
    if (/latest|new|current|update|updated|recent|announces|launches|releases/.test(haystack)) score += 2;
    if (/2023|2024/.test(haystack) && !/2026|this week|today|hours? ago|minutes? ago/.test(haystack)) score -= 4;
    if (/analysis|background|explained/.test(haystack)) score -= 1;
    if (/xai|elon musk|artificial intelligence/.test(haystack) && /xai/i.test(query) && !FINANCIAL_CONTEXT_RE.test(query)) score += 4;
    if (/fund|trust|etf|dividend|yield|ticker/.test(haystack) && /xai/i.test(query) && !FINANCIAL_CONTEXT_RE.test(query)) score -= 6;
    return score;
  };

  const enriched = await Promise.all(merged.map(fetchSourceContent));
  const prioritized = enriched
    .filter((source) => freshnessPriority(source) > -3)
    .sort((a, b) => freshnessPriority(b) - freshnessPriority(a));
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

  const { iso, ymd } = getCurrentDateContext();
  const researchSummary = codeMode
    ? `Research checklist completed at ${iso}: latest stable version guidance, common pitfalls, and best practices for ${extractTechnology(query)}.`
    : `Use the external sources below to silently improve your answer. Current date is ${ymd}, so prioritize the freshest correct entity and discard stale or mismatched results.`;

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

async function fetchJsonCompletion(aiConfig, messages, temperature = 0.2) {
  const response = await fetch(aiConfig.baseUrl, {
    method: 'POST',
    headers: buildHeaders(aiConfig),
    body: JSON.stringify({
      model: aiConfig.model,
      stream: false,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider failed (${aiConfig.model} @ ${aiConfig.baseUrl}): ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return typeof text === 'string' ? text : Array.isArray(text) ? text.map((part) => part?.text || '').join('') : '';
}

function parseReviewJson(text, fallbackText) {
  try {
    const parsed = JSON.parse(text);
    return {
      text: parsed.text || parsed.message || fallbackText,
      state: parsed.state === 'converged' ? 'converged' : 'continue',
    };
  } catch {
    return {
      text: text.trim().slice(0, 240) || fallbackText,
      state: 'continue',
    };
  }
}

function extractStreamText(parsed) {
  const delta = parsed?.choices?.[0]?.delta;
  const content = delta?.content;

  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      return '';
    }).join('');
  }

  if (typeof delta?.text === 'string') return delta.text;
  if (typeof parsed?.choices?.[0]?.message?.content === 'string') return parsed.choices[0].message.content;

  return '';
}

async function runTwoAgentReview(aiConfig, query, history, sources, codeMode, researchMode, onTurn) {
  const baseMessages = formatHistory(history, query, sources, codeMode, researchMode);
  const recentHistory = (Array.isArray(history) ? history : []).slice(-4).map((item) => `${item.role}: ${item.content}`).join('\n');
  const shortOrAmbiguous = query.trim().length < 24 || isGreetingQuery(query) || /^(ok|okay|sure|yes|no|maybe|thanks|thank you|hi|hello|hey)\b/i.test(query.trim());
  const debateModeNote = shortOrAmbiguous
    ? 'The current message is short or ambiguous. Debate the best interpretation and the best helpful response for this exact message. Do not invent a different topic.'
    : 'Debate the best response direction for this exact message. Stay specific and faithful to what the user actually asked.';
  const timeline = [];
  let builderContext = 'Propose the best first-pass response direction.';
  let criticContext = '';
  const maxRounds = 4;

  for (let round = 1; round <= maxRounds; round += 1) {
    const builderText = await fetchJsonCompletion(aiConfig, [
      { role: 'system', content: BUILDER_REVIEW_PROMPT },
      ...baseMessages,
      { role: 'user', content: `Current user message:\n${query}\n\nRecent conversation (for context only):\n${recentHistory || 'None'}\n\n${debateModeNote}\n\nRound ${round}. ${builderContext}${criticContext ? `\n\nLatest critic push:\n${criticContext}` : ''}` },
    ], 0.15);
    const builder = parseReviewJson(builderText, shortOrAmbiguous ? 'Builder proposed a grounded interpretation and reply shape.' : 'Builder proposed a strong first-pass direction.');
    const builderTurn = { round, agent: 'Builder', text: builder.text };
    timeline.push(builderTurn);
    if (onTurn) await onTurn(builderTurn);
    if (builder.state === 'converged' && round > 1) break;

    const criticText = await fetchJsonCompletion(aiConfig, [
      { role: 'system', content: CRITIC_REVIEW_PROMPT },
      ...baseMessages,
      { role: 'user', content: `Current user message:\n${query}\n\nRecent conversation (for context only):\n${recentHistory || 'None'}\n\n${debateModeNote}\n\nRound ${round}. Builder turn:\n${builder.text}\n\nCritique whether Builder stayed faithful to the current message, whether the interpretation is strong, and whether the proposed response would actually help.` },
    ], 0.1);
    const critic = parseReviewJson(criticText, 'Critic pressure-tested the proposed response direction.');
    const criticTurn = { round, agent: 'Critic', text: critic.text };
    timeline.push(criticTurn);
    if (onTurn) await onTurn(criticTurn);

    criticContext = critic.text;
    builderContext = 'Refine the response direction in direct response to the critique, staying tightly anchored to the current message.';
    if (critic.state === 'converged') break;
  }

  const builderFinal = [...timeline].reverse().find((item) => item.agent === 'Builder')?.text || '';
  const criticFinal = [...timeline].reverse().find((item) => item.agent === 'Critic')?.text || '';
  return { timeline, builderFinal, criticFinal };
}

function shouldUseTwoAgentReview(query, explicitFlag) {
  if (explicitFlag === true) return true;
  if (explicitFlag === false) return false;
  return /(compare|comparison|tradeoff|architecture|architect|design this|plan this|strategy|approach|pros and cons|which should|refactor|debug|build|implement|complex|hard|tricky)/i.test(query);
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
    const { query, history, twoAgentReview, forceSearch } = await request.json();
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
    const researchMode = forceSearch === true ? true : clearlyNeedsResearch(query);
    const reviewRequested = shouldUseTwoAgentReview(query, twoAgentReview);
    const reviewEligible = codeMode || /(compare|comparison|tradeoff|architecture|plan|design|strategy|approach|complex|tricky)/i.test(query);
    const reviewMode = twoAgentReview === true ? true : (reviewRequested && reviewEligible);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData('meta', { codeMode, researchMode, reviewMode, model: aiConfig.model, provider: aiConfig.baseUrl })));

        const sources = researchMode || codeMode ? await collectSources(query) : [];
        if (researchMode || codeMode) {
          controller.enqueue(encoder.encode(sseData('sources', { sources })));
        }

        const review = reviewMode
          ? await runTwoAgentReview(aiConfig, query, history, sources, codeMode, researchMode, async (item) => {
              controller.enqueue(encoder.encode(sseData('review', {
                round: item.round,
                agent: item.agent,
                text: item.text,
              })));
            })
          : null;

        const finalMessages = formatHistory(history, query, sources, codeMode, researchMode);
        if (review) {
          finalMessages.push({
            role: 'user',
            content: `Two-Agent Debate final state:\nBuilder: ${review.builderFinal || ''}\n\nCritic: ${review.criticFinal || ''}\n\nNow produce one polished final answer in Mentrophi's normal chat voice. Do not mention Builder or Critic unless the user asks.`,
          });
        }

        const aiResponse = await fetch(aiConfig.baseUrl, {
          method: 'POST',
          headers: buildHeaders(aiConfig),
          body: JSON.stringify({
            model: aiConfig.model,
            stream: true,
            temperature: codeMode ? 0.12 : 0.22,
            messages: finalMessages,
          }),
        });

        if (!aiResponse.ok || !aiResponse.body) {
          const errorText = await aiResponse.text();
          throw new Error(`AI provider failed (${aiConfig.model} @ ${aiConfig.baseUrl}): ${aiResponse.status} ${errorText}`);
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
                const deltaText = extractStreamText(parsed);
                if (deltaText) controller.enqueue(encoder.encode(sseData('chunk', { content: deltaText })));
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
