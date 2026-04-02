const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function nanoid(size = 8) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (let i = 0; i < size; i += 1) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

function inferTitle(files = [], query = '') {
  const firstFile = files[0];
  if (firstFile?.name) return firstFile.name;
  if (firstFile?.content) return firstFile.content.split('\n')[0].slice(0, 80) || 'Shared snippet';
  return query.slice(0, 80) || 'Shared snippet';
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  try {
    const { files, folder_structure = null, author_id = null, expires_at = null, query = '' } = await request.json();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars');
    if (!Array.isArray(files) || !files.length) return new Response(JSON.stringify({ error: 'files is required' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const id = nanoid(8);
    const payload = {
      id,
      title: inferTitle(files, query),
      files,
      folder_structure,
      author_id,
      expires_at,
    };

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/snippets`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    return new Response(JSON.stringify({ id, url: `${new URL(request.url).origin}/c/${id}` }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to create snippet' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
}
