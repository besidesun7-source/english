const seedDocuments = [
  { id: 'hong', name: '26.09.02_홍두선.pdf', date: '2026.09.02', enabled: true, count: 9, color: '#7d67e8' },
  { id: 'aug', name: '26.08.19.pdf', date: '2026.08.19', enabled: true, count: 6, color: '#efad57' }
];
let lessons = [
  { n: '01', title: "It’s up to you", meaning: '네가 정해 / 네게 달려 있어', sentence: "It’s up to you where we go and which movie we watch.", translation: '어디로 갈지, 어떤 영화를 볼지는 네가 정해.', explanation: 'up to는 결정권이나 책임이 누구에게 있는지를 말할 때 써요. 뒤에 의문사절을 붙이면 무엇을 정할지 구체적으로 말할 수 있어요.', tag: '표현' },
  { n: '02', title: 'Want to be / Want to', meaning: '되고 싶다 / 하고 싶다', sentence: 'What do you want to be when you grow up?', translation: '너는 커서 무엇이 되고 싶어?', explanation: 'want to be 뒤에는 직업이나 상태를, want to 뒤에는 행동을 말해요. grow up은 아이가 자라서 어른이 되는 뜻입니다.', tag: '문법' },
  { n: '03', title: 'Sleep vs. Go to bed', meaning: '자고 있다 / 자러 가다', sentence: 'My children go to bed at 9 p.m.', translation: '우리 아이들은 밤 9시에 자러 간다.', explanation: 'sleep은 실제로 잠든 상태이고, go to bed는 잠자리에 가는 행동이에요. 아직 잠들지 않았어도 go to bed를 쓸 수 있어요.', tag: '비교' },
  { n: '04', title: 'Something came up', meaning: '갑자기 일이 생겼어', sentence: 'Something came up, so I can’t go today.', translation: '갑자기 일이 생겨서 오늘 갈 수 없어.', explanation: '구체적으로 설명하기 곤란한 예상 밖의 일이 생겼을 때 쓰는 자연스러운 표현이에요. 핑계가 아니라 상황을 부드럽게 전달하는 느낌입니다.', tag: '표현' },
  { n: '05', title: 'At the last minute', meaning: '막판에 / 마지막 순간에', sentence: 'Something came up at the last minute.', translation: '막판에 갑자기 일이 생겼다.', explanation: '정말 시간이 거의 남지 않은 마지막 순간을 강조할 때 써요. 계획이 막판에 바뀌었을 때 자주 쓰입니다.', tag: '표현' }
];
const readSaved = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
let lessonBank = readSaved('lingo-lesson-bank', lessons.map(lesson => ({ ...lesson, documentId: 'hong' })));
let docs = readSaved('lingo-docs', seedDocuments);
let playing = false, current = 0, auto = true, timer, ttsAudio, playbackId = 0;
let playQueue = [], queueIndex = 0, sessionEndsAt = 0, audioPattern = 0;
const SESSION_MINUTES = 30;
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
let librarySyncTimer, vaultKey, vaultId;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const bytesToBase64 = bytes => { let text=''; for(let start=0;start<bytes.length;start+=0x8000) text+=String.fromCharCode(...bytes.subarray(start,start+0x8000)); return btoa(text); };
const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function createVault(password){
  const secret=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey','deriveBits']);
  const salt=encoder.encode('doo-note-private-library-v1');
  vaultKey=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},secret,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(`doo-note-vault:${password}`)); vaultId=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function encryptLibrary(data){ const iv=crypto.getRandomValues(new Uint8Array(12)); const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},vaultKey,encoder.encode(JSON.stringify(data))); return JSON.stringify({iv:bytesToBase64(iv),cipher:bytesToBase64(new Uint8Array(cipher))}); }
async function decryptLibrary(payload){ const data=JSON.parse(payload), plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(data.iv)},vaultKey,base64ToBytes(data.cipher)); return JSON.parse(decoder.decode(plain)); }
async function syncLibrary(){
  if(!vaultKey || !vaultId)return;
  try { const payload=await encryptLibrary({docs,lessonBank}); await fetch('/api/library', {method:'POST',headers:{'Content-Type':'application/json','x-doo-library-id':vaultId},body:JSON.stringify({payload})}); } catch { /* Local browser storage remains available when offline. */ }
}
function queueLibrarySync(){ if(!vaultKey)return; clearTimeout(librarySyncTimer); librarySyncTimer=setTimeout(syncLibrary,700); }
async function restoreLibrary(){
  if(!vaultKey || !vaultId)return;
  const response=await fetch('/api/library',{headers:{'x-doo-library-id':vaultId}}); if(!response.ok)return;
  const remote=await response.json(); if(!remote.payload){ queueLibrarySync(); return; }
  const library=await decryptLibrary(remote.payload); if(library.docs?.length){ docs=library.docs; lessonBank=library.lessonBank || []; save(); refreshLessons(); renderDocs(); }
}
const audioDb = new Promise((resolve, reject) => {
  const request = indexedDB.open('doo-note-audio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'key' });
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
function audioKey(text){ let hash=5381; for(let i=0;i<text.length;i++) hash=((hash<<5)+hash)^text.charCodeAt(i); return `tts-${hash>>>0}`; }
async function getCachedAudio(key){ const db=await audioDb; return new Promise(resolve=>{const request=db.transaction('tracks').objectStore('tracks').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);}); }
async function saveCachedAudio(track){ const db=await audioDb; return new Promise((resolve,reject)=>{const request=db.transaction('tracks','readwrite').objectStore('tracks').put(track);request.onsuccess=resolve;request.onerror=()=>reject(request.error);}); }
async function cachedAudioList(){ const db=await audioDb; return new Promise(resolve=>{const request=db.transaction('tracks').objectStore('tracks').getAll();request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.savedAt-a.savedAt));request.onerror=()=>resolve([]);}); }
async function clearCachedAudio(){ const db=await audioDb; return new Promise(resolve=>{const request=db.transaction('tracks','readwrite').objectStore('tracks').clear();request.onsuccess=resolve;request.onerror=resolve;}); }
async function renderVoiceCache(){
  const list=$('#voiceCacheList'); if(!list)return; const tracks=await cachedAudioList();
  list.innerHTML=tracks.length ? tracks.map(track=>`<div class="voice-cache-row"><span class="voice-cache-icon">◖</span><div class="voice-cache-copy"><b>${track.title}</b><small>${track.meaning} · ${track.mode}</small></div><button class="voice-cache-play" onclick="playCachedAudio('${track.key}')">▶ 재생</button></div>`).join('') : '<div class="voice-cache-empty"><b>아직 저장된 음성이 없어요.</b>듣기 모드에서 한 번 재생하면 여기에 자동으로 보관됩니다.</div>';
}
window.playCachedAudio=async key=>{ const track=await getCachedAudio(key); if(!track)return; stopSpeech(); playing=false; ttsAudio=new Audio(URL.createObjectURL(track.blob)); ttsAudio.onended=()=>{URL.revokeObjectURL(ttsAudio.src);ttsAudio=null}; await ttsAudio.play(); };
function save(){ localStorage.setItem('lingo-docs', JSON.stringify(docs)); localStorage.setItem('lingo-lesson-bank', JSON.stringify(lessonBank)); queueLibrarySync(); }
function activeLesson(){ return playQueue.length ? playQueue[queueIndex] : lessons[current]; }
function shuffle(items){ const copy=[...items]; for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];} return copy; }
function refreshLessons(){ if(playing){ stopSpeech(); playing=false; $('#togglePlay').textContent='▶'; } playQueue=[]; sessionEndsAt=0; const enabled = new Set(docs.filter(d=>d.enabled).map(d=>d.id)); lessons = lessonBank.filter(lesson => enabled.has(lesson.documentId)); current = 0; renderSources(); renderLessons(); }
function renderSources(){ $('#sourceChips').innerHTML = docs.filter(d=>d.enabled).map(d=>`<span class="source-chip"><i style="background:${d.color}"></i>${d.name}<button onclick="toggleDoc('${d.id}')">×</button></span>`).join('') || '<span class="muted">문서를 선택해주세요</span>'; $('#lessonCount').textContent = lessons.length; }
function renderLessons(){ $('#lessonCards').innerHTML = lessons.length ? lessons.map((l,i)=>`<button class="lesson-card" onclick="openPlayer(${i})"><span class="lesson-num">${l.n}</span><div><span class="tag">${l.tag}</span><b>${l.title}</b><small>${l.meaning}</small></div><span class="speak">◖</span></button>`).join('') : '<p class="empty-lessons">선택한 문서에서 아직 학습할 표현을 찾지 못했어요.</p>'; }
function renderDocs(){ $('#documentList').innerHTML = docs.map(d=>`<div class="document-row"><span class="doc-icon" style="background:${d.color}">PDF</span><div><b>${d.name}</b><small>${d.date} · 핵심 표현 ${d.count}개</small></div><button class="toggle ${d.enabled?'on':''}" onclick="toggleDoc('${d.id}')"><i></i></button><button class="dots">•••</button></div>`).join(''); }
function renderScope(){ $('#scopeOptions').innerHTML=docs.map(d=>`<label class="scope-option"><input type="checkbox" data-id="${d.id}" ${d.enabled?'checked':''}/><span class="check"></span><span><b>${d.name}</b><small>핵심 표현 ${d.count}개</small></span></label>`).join(''); }
window.toggleDoc=id=>{ const d=docs.find(x=>x.id===id); d.enabled=!d.enabled; save(); refreshLessons(); renderDocs();renderScope(); };
function page(id){ $$('.page').forEach(p=>p.classList.toggle('active-page',p.id===id)); $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id)); if(id==='voice-cache')renderVoiceCache(); }
$$('.nav-item').forEach(n=>n.onclick=()=>page(n.dataset.page));
function show(id){ $(id).classList.add('show'); } function hide(id){ $(id).classList.remove('show'); }
function closeModal(modal){
  if (modal.id === 'playerModal') { stopSpeech(); playing=false; sessionEndsAt=0; $('#togglePlay').textContent='▶'; }
  modal.classList.remove('show');
}
$$('.close').forEach(b=>b.onclick=()=>closeModal(b.closest('.modal')));
$('#openScope').onclick=()=>{renderScope();show('#scopeModal')}; $('#saveScope').onclick=()=>{ $$('#scopeOptions input').forEach(x=>docs.find(d=>d.id===x.dataset.id).enabled=x.checked); save(); refreshLessons(); renderDocs();hide('#scopeModal'); };
function updatePlayer(){ const l=activeLesson(); if(!l)return; const position=playQueue.length ? queueIndex+1 : current+1; const total=playQueue.length || lessons.length; $('#playerTitle').textContent=l.title;$('#playerMeaning').textContent=l.meaning;$('#playerSentence').textContent=l.sentence;$('.now-playing span').textContent=String(position).padStart(2,'0'); $('#progressFill').style.width=`${(position/total)*100}%`; const info=$('#sessionInfo'); if(info) info.textContent=sessionEndsAt ? `새로운 조합으로 30분 듣는 중 · ${Math.max(0, Math.ceil((sessionEndsAt-Date.now())/60000))}분 남음` : '표현을 눌러 미리 듣는 중'; }
function startListening(){ if(!lessons.length)return; playQueue=shuffle(lessons); queueIndex=0; audioPattern=Math.floor(Math.random()*3); sessionEndsAt=Date.now()+SESSION_MINUTES*60*1000; updatePlayer(); show('#playerModal'); speak(); }
window.openPlayer=i=>{if(!lessons.length)return;playQueue=[];sessionEndsAt=0;current=i;updatePlayer();show('#playerModal');}; $('.start-listen').onclick=startListening; $$('.mode-card').forEach(x=>x.onclick=()=>x.dataset.mode==='listen'?startListening():openChat());
let intensiveListening = false;
function lessonScript(lesson){
  const scripts = [
    `Today's expression. ${lesson.title}. The meaning is, ${lesson.meaning}. Listen to the example. ${lesson.sentence}. It means, ${lesson.translation || lesson.meaning}. One more time. ${lesson.sentence}.`,
    `Listen first. ${lesson.sentence}. In Korean, it means, ${lesson.translation || lesson.meaning}. The key expression is, ${lesson.title}. Repeat the whole sentence. ${lesson.sentence}.`,
    `Let's practice a useful phrase. ${lesson.title}. ${lesson.meaning}. Say this in English. ${lesson.sentence}. Again, slowly. ${lesson.sentence}.`
  ];
  const base = scripts[audioPattern];
  return intensiveListening ? `${base} Here is why. ${lesson.explanation || 'Listen to how this expression is used in the sentence.'} Repeat after me. ${lesson.sentence}.` : base;
}
function browserLessonAudio(lesson, done){
  const patterns = [
    [[lesson.title,'en-US'],[lesson.meaning,'ko-KR'],[lesson.sentence,'en-US'],[lesson.translation || lesson.meaning,'ko-KR']],
    [[lesson.sentence,'en-US'],[lesson.translation || lesson.meaning,'ko-KR'],[lesson.title,'en-US']],
    [[lesson.title,'en-US'],[lesson.meaning,'ko-KR'],[lesson.sentence,'en-US']]
  ];
  const parts = patterns[audioPattern].map(part => [...part]);
  if (intensiveListening) parts.push([lesson.explanation || '이 표현은 문맥에 맞게 자연스럽게 사용해보세요.','ko-KR']);
  parts.push([lesson.sentence,'en-US']); let index=0;
  const next=()=>{ if(index===parts.length)return done(); const [text,lang]=parts[index++]; const utterance=new SpeechSynthesisUtterance(text); utterance.lang=lang; utterance.rate=lang==='en-US'?.78:.9; utterance.onend=next; speechSynthesis.speak(utterance); }; next();
}
async function speak(){
  const lesson = activeLesson();
  if(!lesson) return;
  const run = ++playbackId;
  speechSynthesis.cancel(); playing=true; $('#togglePlay').textContent='❚❚';
  const moveNext=()=>{
    if (run !== playbackId || !playing) return;
    if(sessionEndsAt && Date.now() >= sessionEndsAt){ playing=false; sessionEndsAt=0; $('#togglePlay').textContent='▶'; const info=$('#sessionInfo'); if(info) info.textContent='30분 듣기를 마쳤어요. 다시 시작하면 새 조합으로 들려드려요.'; return; }
    if(auto){
      if(playQueue.length){ queueIndex=(queueIndex+1)%playQueue.length; if(queueIndex===0){ playQueue=shuffle(lessons); audioPattern=Math.floor(Math.random()*3); } }
      else current=(current+1)%lessons.length;
      updatePlayer(); speak();
    }else{playing=false;$('#togglePlay').textContent='▶'}
  };
  try{
    const script=lessonScript(lesson), key=audioKey(script);
    let cached=await getCachedAudio(key), audioBlob=cached?.blob;
    if(!audioBlob){
      const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:script})});
      if(!response.ok)throw new Error('TTS unavailable');
      audioBlob=await response.blob();
      try { await saveCachedAudio({key,blob:audioBlob,title:lesson.title,meaning:lesson.meaning,mode:`${intensiveListening?'강화':'일반'} 듣기 · 구성 ${audioPattern+1}`,savedAt:Date.now()}); } catch { /* Audio still plays if this device's storage is full. */ }
      if ($('#voice-cache').classList.contains('active-page')) renderVoiceCache();
    }
    if(run!==playbackId || !playing)return;
    ttsAudio=new Audio(URL.createObjectURL(audioBlob)); ttsAudio.onended=()=>{URL.revokeObjectURL(ttsAudio.src);ttsAudio=null;moveNext()}; ttsAudio.play();
  }catch{
    browserLessonAudio(lesson,moveNext);
  }
}
function stopSpeech(){playbackId++;speechSynthesis.cancel();if(ttsAudio){ttsAudio.pause();URL.revokeObjectURL(ttsAudio.src);ttsAudio=null}}
function movePlayer(step){ stopSpeech(); if(playQueue.length) queueIndex=(queueIndex+step+playQueue.length)%playQueue.length; else current=(current+step+lessons.length)%lessons.length; updatePlayer(); if(playing)speak(); }
$('#togglePlay').onclick=()=>{if(playing){stopSpeech();playing=false;$('#togglePlay').textContent='▶'}else speak()}; $('#next').onclick=()=>movePlayer(1);$('#prev').onclick=()=>movePlayer(-1);$('#autoToggle').onclick=e=>{auto=!auto;e.currentTarget.classList.toggle('on',auto)};
$('#intensiveToggle').onclick=e=>{intensiveListening=!intensiveListening;e.currentTarget.classList.toggle('on',intensiveListening);$('#intensiveLabel').textContent=intensiveListening?'강화 듣기 · 설명 포함':'일반 듣기 · 뜻과 예문'};
$('#clearVoiceCache').onclick=async()=>{ await clearCachedAudio(); renderVoiceCache(); };
let qIndex=0, liveConnection, liveStream, liveAudio, questions=[];
function buildQuestions(){
  const patterns = [
    lesson => ({q:`“${lesson.meaning}”를 영어로 말해볼까요?`,a:lesson.sentence}),
    lesson => ({q:`이 표현을 써서 문장을 완성해보세요.<br/><b>${lesson.title}</b>`,a:lesson.sentence}),
    lesson => ({q:`다음 한국어 뜻에 맞는 문장을 말해볼까요?<br/><b>${lesson.translation || lesson.meaning}</b>`,a:lesson.sentence})
  ];
  return shuffle(lessons).slice(0, Math.min(15, lessons.length)).map((lesson,index) => patterns[index % patterns.length](lesson));
}
function addChat(text,who){$('#chatLog').insertAdjacentHTML('beforeend',`<div class="bubble ${who}">${text}</div>`);$('#chatLog').scrollTop=99999;}
function openChat(){qIndex=0;questions=buildQuestions();$('#chatLog').innerHTML='';$('#liveStatus').textContent='수업 노트로 대화하고 있어요';$('#startLive').hidden=false;$('#endLive').hidden=true;addChat('이번에는 선택한 문서에서 새로 섞은 문제로 연습해요. 아래 버튼을 누르면 마이크로 실시간 영어 대화를 시작할 수 있어요. 텍스트로 연습해도 좋아요 :)','bot');if(questions.length)addChat(questions[0].q,'bot');show('#chatModal');}
$('#answerForm').onsubmit=e=>{e.preventDefault();let v=$('#answerInput').value.trim();if(!v)return;addChat(v,'me');$('#answerInput').value='';let q=questions[qIndex];setTimeout(()=>{let correct=v.toLowerCase().replace(/[.?!]/g,'').includes(q.a.toLowerCase().replace(/[.?!]/g,''));addChat(correct?`좋아요! 아주 자연스러워요. ✓`:`좋은 시도예요. 이렇게 말할 수 있어요:<br/><b>${q.a}</b>`,'bot');qIndex++;setTimeout(()=>addChat(qIndex<questions.length?questions[qIndex].q:'오늘 대화는 여기까지예요. 정말 잘했어요! ✦','bot'),400)},350)};
async function startLive(){const button=$('#startLive');button.disabled=true;button.textContent='연결하는 중…';try{liveStream=await navigator.mediaDevices.getUserMedia({audio:true});liveConnection=new RTCPeerConnection();liveAudio=document.createElement('audio');liveAudio.autoplay=true;liveConnection.ontrack=e=>liveAudio.srcObject=e.streams[0];liveConnection.addTrack(liveStream.getAudioTracks()[0]);const channel=liveConnection.createDataChannel('oai-events');channel.onmessage=e=>{const data=JSON.parse(e.data);if(data.type==='conversation.item.input_audio_transcription.completed')addChat(data.transcript,'me');if(data.type==='response.output_audio_transcript.done')addChat(data.transcript,'bot')};const offer=await liveConnection.createOffer();await liveConnection.setLocalDescription(offer);const response=await fetch('/api/realtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,lesson:lessons.map(l=>l.sentence).join(' ')})});if(!response.ok)throw new Error((await response.json()).error||'연결 오류');await liveConnection.setRemoteDescription({type:'answer',sdp:await response.text()});$('#liveStatus').textContent='듣고 있어요 · 자유롭게 영어로 말해보세요';button.hidden=true;$('#endLive').hidden=false;addChat('연결됐어요. 오늘 배운 표현을 써서 편하게 말해보세요!','bot')}catch(error){$('#liveStatus').textContent=error.message||'마이크 또는 연결 오류';button.disabled=false;button.textContent='●  음성 대화 시작'}}
function endLive(){liveStream?.getTracks().forEach(t=>t.stop());liveConnection?.close();liveAudio?.pause();liveStream=liveConnection=liveAudio=null;$('#liveStatus').textContent='음성 대화가 종료됐어요';$('#startLive').hidden=false;$('#startLive').disabled=false;$('#startLive').textContent='●  음성 대화 시작';$('#endLive').hidden=true}
$('#startLive').onclick=startLive;$('#endLive').onclick=endLive;$('#chatModal .close').addEventListener('click',endLive);
async function readDocument(file) {
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const content = await (await pdf.getPage(index + 1)).getTextContent();
      // PDF text is positioned, not inherently line-based. Rebuild its visible
      // rows (and table columns) so that English, Korean translations, and
      // expression/meaning pairs do not get separated during extraction.
      const rows = [];
      content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        let row = rows.find(candidate => Math.abs(candidate.y - y) <= 2);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ text: item.str, x: item.transform[4], width: item.width || 0 });
      });
      return rows.sort((a,b) => b.y-a.y).map(row => {
        const items = row.items.sort((a,b) => a.x-b.x);
        let previous;
        return items.map(item => {
          const gap = previous ? item.x - (previous.x + previous.width) : 0;
          previous = item;
          return `${gap > 30 ? '\t' : ' '}${item.text}`;
        }).join('').trim();
      }).filter(Boolean).join('\n');
    }));
    return pages.join('\n');
  }
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}
function documentLessons(text, documentId) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const results = [], used = new Set();
  const isHeader = line => /^(핵심\s*표현|말하기\s*틀|표현\s*\t?\s*뜻|DAY\s*\d|\d{2}\.|영어\s*원문|해석)$/i.test(line.replace(/\s+/g,' '));
  const add = lesson => {
    const key = `${lesson.title}|${lesson.translation}`.toLowerCase();
    if (!used.has(key) && lesson.title && lesson.translation) { used.add(key); results.push({ ...lesson, documentId }); }
  };

  // This matches the study-PDF layout: "영어 원문" followed by "해석".
  for (let i=0; i<lines.length; i++) {
    if (!/^영어\s*원문$/i.test(lines[i].replace(/\s+/g,''))) continue;
    const english = [], korean = [];
    let readingKorean = false;
    for (i=i+1; i<lines.length; i++) {
      const line = lines[i];
      if (/^해석$/i.test(line.replace(/\s+/g,''))) { readingKorean=true; continue; }
      if (/^(핵심\s*표현|말하기\s*틀|영어\s*원문|\d{2}\.|DAY\s*\d)/i.test(line)) { i--; break; }
      if (readingKorean) korean.push(line); else english.push(line);
    }
    const sentence = english.join(' ').replace(/\s+/g,' ').trim();
    const translation = korean.join(' ').replace(/\s+/g,' ').trim();
    if (sentence && translation) {
      const title = sentence.replace(/[.!?].*/, '').split(' ').slice(0,7).join(' ');
      add({ n:'', title, meaning:translation, sentence, translation, explanation:'문서의 영어 원문과 해석을 함께 듣고, 핵심 표현을 문맥 속에서 익혀보세요.', tag:'지문 이해' });
    }
  }

  // Table rows are rebuilt with tabs above, e.g. "sleep in\t늦잠 자다".
  lines.forEach(line => {
    const pair = line.split('\t').map(part => part.trim()).filter(Boolean);
    if (pair.length < 2 || isHeader(line)) return;
    const [english, korean] = pair;
    if (!/[A-Za-z]/.test(english) || !/[가-힣]/.test(korean) || english.length > 80) return;
    add({ n:'', title:english, meaning:korean, sentence:english, translation:korean, explanation:'PDF의 핵심 표현 표에 나온 뜻입니다. 먼저 뜻을 듣고, 영어 표현을 따라 말해보세요.', tag:'핵심 표현' });
  });
  return results.slice(0,160).map((lesson, index) => ({ ...lesson, n:String(index+1).padStart(2,'0') }));
}
function makeLessons(text, documentId) {
  const structured = documentLessons(text, documentId);
  if (structured.length) {
    lessonBank = lessonBank.filter(lesson => lesson.documentId !== documentId).concat(structured);
    save(); refreshLessons(); return;
  }
  throw new Error('AI 분석을 기다리는 문서입니다. 의미가 틀린 임시 문제는 만들지 않았어요.');
}
function setAiLessons(cards, documentId) {
  const clean = cards.filter(card => card && card.title && card.meaning && card.sentence && card.translation)
    .slice(0,160).map((card,index) => ({
      n:String(index+1).padStart(2,'0'), title:card.title.trim(), meaning:card.meaning.trim(),
      sentence:card.sentence.trim(), translation:card.translation.trim(),
      explanation:(card.explanation || '문서의 문맥과 함께 익혀보세요.').trim(), tag:(card.tag || 'AI 학습').trim(), documentId
    }));
  if (!clean.length) throw new Error('AI가 학습 항목을 만들지 못했습니다.');
  lessonBank = lessonBank.filter(lesson => lesson.documentId !== documentId).concat(clean);
  save(); refreshLessons();
}
async function analyzeDocument(text, name) {
  const response = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text,name}) });
  if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || 'AI 분석 오류');
  const result = await response.json();
  return result.lessons;
}
async function addFiles(files){
  for (const f of files) {
    if (!/\.(pdf|docx)$/i.test(f.name)) continue;
    const existing = docs.find(doc => doc.name === f.name);
    const id = existing?.id || String(Date.now() + Math.random());
    if (existing) { existing.date='AI가 학습 자료 만드는 중…'; existing.enabled=true; existing.count=0; lessonBank=lessonBank.filter(lesson=>lesson.documentId!==id); }
    else docs.unshift({id,name:f.name,date:'AI가 학습 자료 만드는 중…',enabled:true,count:0,color:'#63a88e'});
    renderSources(); renderDocs();
    try {
      const text = await readDocument(f);
      docs.find(d => d.id === id).sourceText = text.slice(0,1500000);
      try { setAiLessons(await analyzeDocument(text, f.name), id); }
      catch (aiError) { makeLessons(text, id); }
      const doc = docs.find(d => d.id === id);
      doc.date = new Date().toLocaleDateString('ko-KR').replace(/\. /g,'.').replace(/\.$/,'');
      doc.count = lessonBank.filter(lesson => lesson.documentId === id).length;
    } catch (error) {
      const doc = docs.find(d => d.id === id);
      doc.date = error.message || '읽을 수 없는 문서';
    }
  }
  save(); renderSources(); renderDocs();
}
$('#fileInput').onchange=e=>addFiles(e.target.files); $('#uploadZone').ondragover=e=>{e.preventDefault();$('#uploadZone').classList.add('drag')};$('#uploadZone').ondragleave=()=>$('#uploadZone').classList.remove('drag');$('#uploadZone').ondrop=e=>{e.preventDefault();$('#uploadZone').classList.remove('drag');addFiles(e.dataTransfer.files)};
$('.mobile-menu').onclick=()=>$('.sidebar').classList.toggle('open');
refreshLessons();renderDocs();
$('#syncForm').onsubmit=async e=>{ e.preventDefault(); const password=$('#syncPassword').value; if(!password)return; const button=$('#syncForm button'); button.disabled=true; button.textContent='암호화 보관함 여는 중…'; try { await createVault(password); await restoreLibrary(); hide('#syncModal'); } catch { $('#syncPassword').value=''; $('#syncPassword').placeholder='비밀번호가 맞지 않거나 연결할 수 없어요'; } finally { button.disabled=false; button.textContent='암호화 보관함 연결'; } };
$('#skipSync').onclick=()=>hide('#syncModal');
show('#syncModal');
