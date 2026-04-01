const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `You are Mentrophi, a deep research AI. Given search results
and a user query, write a thorough, structured, insightful
answer. Use markdown with ## headings and bullet points.
Cite sources inline as [1], [2]. Always respond in the same
language as the user query. Go deeper than surface-level --
explain the why, the tradeoffs, the context, the nuance.`;

function decodeHtml(value = '') {
  return value
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

    results.push({
      title,
      snippet,
      url,
      displayUrl: visibleUrl || new URL(url).hostname,
    });

    if (results.length === 8) break;
  }

  return results;
}

function formatHistory(history, sources) {
  const safeHistory = Array.isArray(history) ? history : [];
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  for (const item of safeHistory) {
    if (!item || typeof item.role !== 'string' || typeof item.content !== 'string') continue;
    if (!['user', 'assistant', 'system'].includes(item.role)) continue;
    messages.push({ role: item.role, content: item.content });
  }

  messages.push({
    role: 'user',
    content: [
      `User query: ${safeHistory.at(-1)?.role === 'user' ? safeHistory.at(-1).content : ''}`,
      '',
      'Search results:',
      ...sources.map((source, index) => `${index + 1}. ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`),
    ].join('\n'),
  });

  return messages;
}

function sseData(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

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

    if (!env.NVIDIA_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing NVIDIA_API_KEY' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const searchResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!searchResponse.ok) {
      throw new Error(`DuckDuckGo search failed with status ${searchResponse.status}`);
    }

    const searchHtml = await searchResponse.text();
    const sources = extractSearchResults(searchHtml);

    const nimResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-4-scout-17b-16e-instruct',
        stream: true,
        temperature: 0.4,
        messages: formatHistory(Array.isArray(history) ? history : [{ role: 'user', content: query }], sources),
      }),
    });

    if (!nimResponse.ok || !nimResponse.body) {
      const errorText = await nimResponse.text();
      throw new Error(`NVIDIA NIM failed: ${nimResponse.status} ${errorText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData('sources', { sources })));

        const reader = nimResponse.body.getReader();
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
                if (delta) {
                  controller.enqueue(encoder.encode(sseData('chunk', { content: delta })));
                }
              } catch (error) {
                controller.enqueue(encoder.encode(sseData('error', { error: 'Failed to parse NVIDIA stream chunk.' })));
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
