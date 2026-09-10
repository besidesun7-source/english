const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const lessonSchema = { type:'object', additionalProperties:false, properties:{ lessons:{ type:'array', items:{ type:'object', additionalProperties:false, properties:{ title:{type:'string'}, meaning:{type:'string'}, sentence:{type:'string'}, translation:{type:'string'}, explanation:{type:'string'}, tag:{type:'string'} }, required:['title','meaning','sentence','translation','explanation','tag'] } } }, required:['lessons'] };
const analysisInstructions = `You convert a Korean learner's English study document into high-quality listening and speaking study cards. Read the entire source, regardless of its layout. Return 30 to 80 distinct cards when the source supports that many; otherwise return every worthwhile card. Each card must have: a useful English expression as title, its concise natural Korean meaning, one complete English sentence from the source (or a faithful example based directly on it), a natural Korean translation of that sentence, a short Korean explanation of grammar/usage, and a tag. Never use placeholder text. Do not pair an English sentence with an unrelated Korean translation. Prefer the document's own translations and expressions. Remove repetition, headings, page numbers, and broken text. Output only the requested JSON.`;
const outputText = data => data.output_text || (data.output || []).flatMap(item => item.content || []).map(content => content.text || '').join('');
const libraryId = request => request.headers.get('x-doo-library-id') || '';
const validLibraryId = value => /^[a-f0-9]{64}$/.test(value);
const libraryKey = id => `encrypted-library:${id}`;

async function getLibrary(request, env) {
  const id = libraryId(request);
  if (!validLibraryId(id)) return json({ error:'유효하지 않은 개인 보관함입니다.' },400);
  const payload = await env.DOO_NOTE_LIBRARY.get(libraryKey(id));
  return json({ payload:payload || null });
}

async function saveLibrary(request, env) {
  const id = libraryId(request);
  if (!validLibraryId(id)) return json({ error:'유효하지 않은 개인 보관함입니다.' },400);
  const { payload } = await request.json();
  if (typeof payload !== 'string' || payload.length > 20000000) return json({ error:'보관함 형식이 올바르지 않습니다.' },400);
  await env.DOO_NOTE_LIBRARY.put(libraryKey(id), payload);
  return json({ saved:true });
}

async function analyze(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, 503);
  try {
    const { text, name } = await request.json();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{ Authorization:`Bearer ${env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body:JSON.stringify({ model:'gpt-4o-mini', store:false, instructions:analysisInstructions, input:`Document name: ${name || 'study document'}\n\nSOURCE:\n${String(text || '').slice(0,140000)}`, text:{format:{type:'json_schema',name:'english_study_cards',strict:true,schema:lessonSchema}}, max_output_tokens:12000 })
    });
    if (!response.ok) return new Response(response.body, {status:response.status,headers:{'content-type':'application/json'}});
    return json(JSON.parse(outputText(await response.json())));
  } catch { return json({ error:'AI 학습 자료를 만들 수 없습니다.' },500); }
}

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
    if (pathname === '/api/library' && request.method === 'GET') return getLibrary(request, env);
    if (pathname === '/api/library' && request.method === 'POST') return saveLibrary(request, env);
    if (request.method === 'POST' && pathname === '/api/analyze') return analyze(request, env);
    if (request.method === 'POST' && pathname === '/api/speech') return speech(request, env);
    if (request.method === 'POST' && pathname === '/api/realtime') return realtime(request, env);
    return env.ASSETS.fetch(request);
  }
};
