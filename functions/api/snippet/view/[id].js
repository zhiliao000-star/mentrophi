const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars');
    const getRes = await fetch(`${env.SUPABASE_URL}/rest/v1/snippets?id=eq.${encodeURIComponent(params.id)}&select=id,view_count`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!getRes.ok) throw new Error(await getRes.text());
    const rows = await getRes.json();
    const snippet = rows[0];
    if (!snippet) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/snippets?id=eq.${encodeURIComponent(params.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ view_count: (snippet.view_count || 0) + 1 }),
    });
    if (!patchRes.ok) throw new Error(await patchRes.text());

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to increment views' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
}
