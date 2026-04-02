const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function contentTypeFor(name = '') {
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css; charset=utf-8';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  if (name.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars');
    const url = new URL(request.url);
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/snippets?id=eq.${encodeURIComponent(params.id)}&select=*`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const snippet = rows[0];
    if (!snippet) return new Response('Not found', { status: 404, headers: CORS_HEADERS });

    if (url.searchParams.get('raw') === 'true') {
      const fileName = url.searchParams.get('file') || snippet.files?.[0]?.name;
      const file = (snippet.files || []).find((entry) => entry.name === fileName) || snippet.files?.[0];
      if (!file) return new Response('Not found', { status: 404, headers: CORS_HEADERS });
      return new Response(file.content || '', { headers: { ...CORS_HEADERS, 'Content-Type': contentTypeFor(file.name || '') } });
    }

    return new Response(JSON.stringify(snippet), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to fetch snippet' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
}
