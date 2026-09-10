const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function speech(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, 503);
  const { text } = await request.json();
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts', voice: 'marin', input: text,
      instructions: 'Act as a warm bilingual English tutor. Read English phrases slowly with a natural American accent. Read Korean meanings and explanations fluently in natural Korean. Pause briefly between sections.',
      response_format: 'mp3'
    })
  });
  return new Response(response.body, { status: response.status, headers: { 'content-type': response.ok ? 'audio/mpeg' : 'application/json', 'cache-control': 'no-store' } });
}

async function realtime(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, 503);
  const { sdp, lesson } = await request.json();
  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      sdp,
      session: {
        type: 'realtime', model: 'gpt-realtime-mini', audio: { output: { voice: 'marin' } },
        instructions: `You are a warm English conversation coach. Speak slowly and naturally. Ask one short question at a time. Gently correct errors in Korean, then say the natural English sentence. Lesson notes: ${lesson}`,
        turn_detection: { type: 'server_vad' }
      }
    })
  });
  return new Response(response.body, { status: response.status, headers: { 'content-type': response.ok ? 'application/sdp' : 'application/json' } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && pathname === '/api/speech') return speech(request, env);
    if (request.method === 'POST' && pathname === '/api/realtime') return realtime(request, env);
    return env.ASSETS.fetch(request);
  }
};
