import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json' };
const port = Number(process.env.PORT || 5173);
const coach = 'You are a warm English conversation coach. Speak slowly and naturally. Ask one short question at a time. Gently correct errors in Korean, then say the natural English sentence.';
const lessonSchema = {
  type: 'object', additionalProperties: false,
  properties: { lessons: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    title:{type:'string'}, meaning:{type:'string'}, sentence:{type:'string'}, translation:{type:'string'}, explanation:{type:'string'}, tag:{type:'string'}
  }, required:['title','meaning','sentence','translation','explanation','tag'] } } }, required:['lessons']
};
const analysisInstructions = `You convert a Korean learner's English study document into high-quality listening and speaking study cards. Read the entire source, regardless of its layout. Return 20 to 45 distinct, high-value cards when the source supports that many; otherwise return every worthwhile card. Each card must have: a useful English expression as title, its concise natural Korean meaning, one complete English sentence from the source (or a faithful example based directly on it), a natural Korean translation of that sentence, a short Korean explanation of grammar/usage, and a tag. Never use placeholder text. Do not pair an English sentence with an unrelated Korean translation. Prefer the document's own translations and expressions. Remove repetition, headings, page numbers, and broken text. Output only the requested JSON.`;
function outputText(data) { return data.output_text || (data.output || []).flatMap(item => item.content || []).map(content => content.text || '').join(''); }
createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') {
    if (!process.env.OPENAI_API_KEY) { res.writeHead(503, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'OPENAI_API_KEY가 설정되지 않았습니다.'})); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    try {
      const { text, name } = JSON.parse(raw);
      const source = String(text || '').slice(0, 140000);
      const api = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({
        model:'gpt-4o-mini', store:false, instructions:analysisInstructions,
        input:`Document name: ${name || 'study document'}\n\nSOURCE:\n${source}`,
        text:{format:{type:'json_schema',name:'english_study_cards',strict:true,schema:lessonSchema}}, max_output_tokens:6000
      }) });
      if (!api.ok) { res.writeHead(api.status, {'Content-Type':'application/json'}); return res.end(await api.text()); }
      const data = await api.json(); const result = JSON.parse(outputText(data));
      res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(500, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'AI 학습 자료를 만들 수 없습니다.'})); }
  }
  if (req.method === 'POST' && req.url === '/api/speech') {
    if (!process.env.OPENAI_API_KEY) { res.writeHead(503, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'OPENAI_API_KEY가 설정되지 않았습니다.'})); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    try {
      const { text } = JSON.parse(raw);
      const api = await fetch('https://api.openai.com/v1/audio/speech', { method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'marin',input:text,instructions:'Act as a warm bilingual English tutor. Read English phrases slowly with a natural American accent. Read Korean meanings and explanations fluently in natural Korean. Pause briefly between the English phrase, Korean meaning, example, and explanation.',response_format:'mp3'}) });
      if (!api.ok) { res.writeHead(api.status, {'Content-Type':'application/json'}); return res.end(await api.text()); }
      res.writeHead(200, {'Content-Type':'audio/mpeg','Cache-Control':'no-store'}); return res.end(Buffer.from(await api.arrayBuffer()));
    } catch { res.writeHead(500, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'음성을 만들 수 없습니다.'})); }
  }
  if (req.method === 'POST' && req.url === '/api/realtime') {
    if (!process.env.OPENAI_API_KEY) { res.writeHead(503, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'OPENAI_API_KEY가 설정되지 않았습니다.'})); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    try {
      const { sdp, lesson } = JSON.parse(raw);
      const api = await fetch('https://api.openai.com/v1/realtime/calls', { method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({sdp,session:{type:'realtime',model:'gpt-realtime-mini',audio:{output:{voice:'marin'}},instructions:`${coach}\nLesson notes: ${lesson}`,turn_detection:{type:'server_vad'}}}) });
      const answer = await api.text(); res.writeHead(api.status, {'Content-Type':api.ok?'application/sdp':'application/json'}); return res.end(answer);
    } catch { res.writeHead(500, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'실시간 연결을 시작할 수 없습니다.'})); }
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`Lingo Note is running at http://localhost:${port}`));
