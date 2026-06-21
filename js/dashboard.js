let lastVideoSignature="", lastReadySignature="", lastDoneOutput="", adminUnlocked=false, processMode=localStorage.getItem("azukoProcessMode")||"simple";
let currentStoryPreview="", currentStoryPreviewMeta=null, previewConfigSignature="";

let activeChannelProfile = localStorage.getItem("azukoChannelProfile") || "reddit-en";
let activeEngineMode = localStorage.getItem("azukoEngineMode") || "reddit";
let resolvedRandomStoryType = null;

const AZUKO_V2_PROFILES = {
  "reddit-de": { label:"Reddit DE", engine:"reddit", lang:"de" },
  "reddit-en": { label:"Reddit EN", engine:"reddit", lang:"en" },
  "roblox-de": { label:"Roblox DE", engine:"roblox", lang:"de" },
  "roblox-en": { label:"Roblox EN", engine:"roblox", lang:"en" },
  "fruits": { label:"Fruits", engine:"fruits", lang:"de" }
};

const AZUKO_ENGINE_DEFS = [
  {id:"reddit", icon:"🧵", title:"Fake Reddit Stories", status:"active", desc:"Hook-first stories for TikTok and Shorts.", scores:["Hook Quality","Story Quality","Subtitle Quality"]},
  {id:"roblox", icon:"🎮", title:"Roblox Rant", status:"foundation", desc:"Funny ragebait storytelling for YouTube.", scores:["Ragebait Score","Story Quality","Subtitle Quality"]},
  {id:"fruits", icon:"🍒", title:"Gangster Fruits", status:"foundation", desc:"Character-driven mafia fruit stories.", scores:["Character Score","Humor Score","Subtitle Quality"]},
  {id:"ad", icon:"📦", title:"Ad Engine", status:"coming later", desc:"Product image ads. Placeholder only.", scores:["Concept Score","Hook Score","Subtitle Quality"]}
];

const AZUKO_FRUIT_CHARACTERS = [
  {name:"Lenny Boss", type:"Kirsche", role:"Boss", relation:"Founder", tone:"Mafia serious + funny"},
  {name:"Joe Boss", type:"Ananas", role:"Rival", relation:"Frenemy", tone:"Loud, tropical, chaotic"},
  {name:"Mira", type:"Erdbeere", role:"Strategin", relation:"Ally", tone:"Smart, calm, dangerous"}
];

function clampScore(n){return Math.max(0,Math.min(100,Math.round(Number(n)||0)));}
function qualityEmoji(score){score=clampScore(score);return score>=80?'🟢':score>=55?'🟡':'🔴';}
function qualityLabel(score){score=clampScore(score);return score>=80?'Strong':score>=55?'Okay':'Weak';}
function wordCount(text){return String(text||'').trim().split(/\s+/).filter(Boolean).length;}

function estimateSubtitleQuality(text, duration=Number(document.getElementById('duration')?.value||30)){
  const words=wordCount(text);
  const wps=words/Math.max(1,duration);
  let score=100;
  if(wps>2.6) score-=Math.min(45,(wps-2.6)*35);
  if(wps>3.2) score-=20;
  if(words>duration*2.8) score-=15;
  return {score:clampScore(score), wps:Number(wps.toFixed(2)), words};
}
function estimateStoryQuality(text){
  const t=String(text||'');
  let score=62;
  if(/[?!]/.test(t.slice(0,160))) score+=8;
  if(/proof|receipt|recording|camera|message|aufnahme|beweis|screenshots/i.test(t)) score+=12;
  if(/but|then|until|suddenly|worst|plötzlich|aber|dann|bis/i.test(t)) score+=10;
  if(wordCount(t)>40) score+=8;
  if(wordCount(t)>190) score-=10;
  return clampScore(score);
}
function estimateHookQuality(text){
  const first=String(text||'').split(/[.!?]/)[0]||String(text||'').slice(0,120);
  let score=58;
  if(wordCount(first)<=18) score+=10;
  if(/my|i |aita|wrong|family|mom|dad|inheritance|cheating|boss|neighbor/i.test(first)) score+=10;
  if(/until|when|after|found|heard|saw|proof|secret|lied/i.test(first)) score+=14;
  if(first.length>135) score-=14;
  return clampScore(score);
}
function estimateRagebaitQuality(text){
  let score=60;
  if(/bro|actually|insane|crazy|rage|kid|roblox|server|ban|scam|wild|npc/i.test(text)) score+=18;
  if(/[!?]/.test(text)) score+=8;
  if(wordCount(text)>35) score+=8;
  return clampScore(score);
}
function estimateHumorQuality(text){
  let score=62;
  if(/boss|mafia|rival|banana|cherry|fruit|kirsche|ananas|gang|crew|betray/i.test(text)) score+=16;
  if(/funny|meme|chaos|bruder|digga|wild/i.test(text)) score+=10;
  return clampScore(score);
}
function getQualitySnapshot(){
  const text=currentStoryPreview || document.getElementById('storyPreviewText')?.textContent || document.getElementById('direction')?.value || '';
  const duration=Number(document.getElementById('duration')?.value||30);
  const story=estimateStoryQuality(text);
  const sub=estimateSubtitleQuality(text,duration).score;
  const engine=activeEngineMode || AZUKO_V2_PROFILES[activeChannelProfile]?.engine || "reddit";
  let video = Math.round((story+sub+82)/3);
  return {engine, video:clampScore(video), story, subtitle:sub, hook:estimateHookQuality(text), rage:estimateRagebaitQuality(text), humor:estimateHumorQuality(text), character:estimateHumorQuality(text)};
}
function setScoreText(id, score, hintId, hint){
  const el=document.getElementById(id);
  if(el) el.textContent=`${qualityEmoji(score)} ${clampScore(score)}/100`;
  const h=document.getElementById(hintId);
  if(h) h.textContent=hint || qualityLabel(score);
}
function updateQualityDashboard(){
  const q=getQualitySnapshot();
  setScoreText('videoQualityScore', q.video, 'videoQualityHint', `${qualityLabel(q.video)} output · ${activeChannelProfile}`);
  setScoreText('storyQualityScore', q.story, 'storyQualityHint', `${qualityLabel(q.story)} storytelling`);
  setScoreText('subtitleQualityScore', q.subtitle, 'subtitleQualityHint', `Readable subtitle target`);
  updateEngineScoreCards(q.engine);
}
function setChannelProfile(profile){
  activeChannelProfile=profile || "reddit-en";
  localStorage.setItem("azukoChannelProfile",activeChannelProfile);
  const cfg=AZUKO_V2_PROFILES[activeChannelProfile]||AZUKO_V2_PROFILES["reddit-en"];
  setEngineMode(cfg.engine);
  const lang=document.getElementById('language');
  if(lang){lang.value=cfg.lang;document.querySelectorAll('.segment[data-target="language"] button').forEach(b=>b.classList.toggle('active',b.dataset.value===cfg.lang));}
  updateQualityDashboard();
}
function setEngineMode(engine){
  activeEngineMode=engine || "reddit";
  localStorage.setItem("azukoEngineMode",activeEngineMode);
  const select=document.getElementById('engineMode'); if(select) select.value=activeEngineMode;
  const hint=document.getElementById('engineCreateHint');
  if(hint){
    const map={reddit:'Reddit Engine aktiv. Hook Score wird hier angezeigt.',roblox:'Roblox Foundation aktiv. Fokus: Ragebait + Storytelling.',fruits:'Gangster Fruits Foundation aktiv. Fokus: Charaktere + Humor.'};
    hint.textContent=map[activeEngineMode]||'Engine prepared.';
  }
  updateEngineScoreCards(activeEngineMode);
}
function renderEngineHub(){
  const el=document.getElementById('engineHubCards');
  if(el) el.innerHTML=AZUKO_ENGINE_DEFS.map(e=>`<button class="engine-hub-card ${e.id===activeEngineMode?'selected':''}" onclick="setEngineMode('${e.id}');openPage('${e.id==='ad'?'engines':'create'}')"><span>${e.icon}</span><b>${e.title}</b><small>${e.desc}</small><em>${e.status}</em></button>`).join('');
  const fruits=document.getElementById('fruitCharacters');
  if(fruits) fruits.innerHTML=AZUKO_FRUIT_CHARACTERS.map(c=>`<div class="fruit-profile-card"><div class="fruit-top">${c.type}</div><b>${c.name}</b><span>${c.role}</span><small>${c.relation} · ${c.tone}</small></div>`).join('');
  updateEngineScoreCards(activeEngineMode);
}
function updateEngineScoreCards(engine=activeEngineMode){
  const q=getQualitySnapshot();
  const def=AZUKO_ENGINE_DEFS.find(e=>e.id===engine)||AZUKO_ENGINE_DEFS[0];
  const title=document.getElementById('engineScoreTitle');
  if(title) title.textContent=def.title + " Quality";
  const values = engine==='reddit'
    ? [q.hook,q.story,q.subtitle]
    : engine==='roblox'
      ? [q.rage,q.story,q.subtitle]
      : engine==='fruits'
        ? [q.character,q.humor,q.subtitle]
        : [76,72,q.subtitle];
  const el=document.getElementById('engineScoreCards');
  if(el) el.innerHTML=def.scores.map((label,i)=>`<div class="engine-score-card"><span>${label}</span><b>${qualityEmoji(values[i])} ${values[i]}/100</b><small>${qualityLabel(values[i])}</small></div>`).join('');
  renderEngineHubSelectedOnly();
}
function renderEngineHubSelectedOnly(){
  document.querySelectorAll('.engine-hub-card').forEach(card=>{
    const text=card.textContent.toLowerCase();
    card.classList.toggle('selected',
      (activeEngineMode==='reddit'&&text.includes('reddit'))||
      (activeEngineMode==='roblox'&&text.includes('roblox'))||
      (activeEngineMode==='fruits'&&text.includes('fruits'))||
      (activeEngineMode==='ad'&&text.includes('ad engine')));
  });
}
function resolveStoryType(value){
  if(value && value!=='random'){resolvedRandomStoryType=null;return value;}
  const pool=['family-drama','aita','inheritance','revenge','cheating','work-drama','crazy-neighbor','mystery'];
  if(!resolvedRandomStoryType) resolvedRandomStoryType=pool[Math.floor(Math.random()*pool.length)];
  return resolvedRandomStoryType;
}


function toggleProfileMenu(event){
  event?.stopPropagation?.();
  document.getElementById('profileMenu')?.classList.toggle('hidden');
}
function closeProfileMenu(){document.getElementById('profileMenu')?.classList.add('hidden');}
document.addEventListener('click',e=>{if(!e.target.closest('.profile-menu-wrap'))closeProfileMenu();});
function logoutAzuko(){localStorage.removeItem('azukoVerified');location.reload();}
function openControlSection(section){
  openPage('admin');
  const target = section || 'overview';
  document.querySelectorAll('.control-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.control-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.control===target));
  const el=document.getElementById('control-'+target) || document.getElementById('control-overview');
  if(el){el.classList.add('active');}
}

function setProcessMode(mode){
  processMode = mode === 'code' ? 'code' : 'simple';
  localStorage.setItem('azukoProcessMode', processMode);
  document.getElementById('simpleModeBtn')?.classList.toggle('active', processMode==='simple');
  document.getElementById('codeModeBtn')?.classList.toggle('active', processMode==='code');
  document.getElementById('simpleProcess')?.classList.toggle('hidden', processMode!=='simple');
  document.getElementById('codeProcess')?.classList.toggle('hidden', processMode!=='code');
}
function stageToCode(s){
  const c=s.config||{};
  const stage=s.stage||'idle';
  const lines=[];
  lines.push(`[system.version] Azuko Generation LLC v2.0`);
  lines.push(`[process.mode] ${processMode}`);
  lines.push(`[status.stage] ${stage}`);
  lines.push(`[status.progress] ${s.progress||0}%`);
  lines.push(`[status.message] ${s.message||'Bereit'}`);
  if(c.source) lines.push(`[config.source] ${c.source}`);
  if(c.storyType) lines.push(`[story.generate] type=${c.storyType} mode=${c.storyMode||'question'} lang=${c.language||'en'}`);
  if(c.voiceGender) lines.push(`[voice.create] gender=${c.voiceGender} engine=edge-tts`);
  lines.push(`[subtitles.sync] style=large-clean chunks=3-4words position=lower-middle`);
  lines.push(`[background.local] C:\\Users\\Lenni\\Desktop\\_Backgrounds_for_Azuko_Generation_LLC`);
  if(stage==='rendering') lines.push(`[render.video] ffmpeg=running format=1080x1920`);
  if(stage==='done') {
    lines.push(`[tiktok.ready] title=generated hashtags=viral copybox=created`);
    lines.push(`[youtube.schedule] status=prepared best_time=auto thumbnail=best_frame`);
  }
  if(s.output) lines.push(`[output.file] ${s.output.split(/[\\/]/).pop()}`);
  return lines.join('\n');
}
function youtubeScheduleHtml(items){
  const list=(items||[]);
  return list.map(x=>`<div class="schedule-item"><div><b>${x.title||x.videoFile}</b><span>${x.channel||'Reddit Stories'} · ${x.scheduledTime||'auto'} · ${x.status||'prepared'}</span></div><small>${x.videoFile||''}</small></div>`).join('')||'<div class="file"><span class="muted">Noch keine YouTube Schedule Items.</span></div>';
}
function channelsHtml(channels){
  return (channels||[]).map(c=>`<div class="file"><div><div class="file-name">${c.name}</div><div class="file-meta">${c.status} · ${c.purpose}</div></div></div>`).join('')||'<div class="file"><span class="muted">Noch keine Kanäle verbunden.</span></div>';
}
function openPage(name){
  const app=document.querySelector('.app');
  if(app)app.classList.toggle('admin-mode', name==='admin'||name==='admin-login');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  const nav=[...document.querySelectorAll('.nav button')].find(b=>b.dataset.page===name);
  if(nav)nav.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const page=document.getElementById('page-'+name);
  if(page)page.classList.add('active');
  if(name==='admin'){adminUnlocked=true;loadAdmin();setTimeout(()=>{if(!document.querySelector('.control-page.active'))openControlSection('overview');},0);}
  if(name==='schedule')loadScheduler();
}
document.querySelectorAll('.nav button').forEach(btn=>{btn.addEventListener('click',()=>openPage(btn.dataset.page));});
document.querySelectorAll('.segment').forEach(group=>{group.addEventListener('click',e=>{const btn=e.target.closest('button[data-value]');if(!btn)return;const target=group.dataset.target;document.getElementById(target).value=btn.dataset.value;document.querySelectorAll(`.segment[data-target="${target}"] button`).forEach(b=>b.classList.remove('active'));btn.classList.add('active');updateLengthInfo();});});
document.getElementById('source').addEventListener('change',()=>{const reddit=document.getElementById('source').value==='reddit';document.getElementById('subredditWrap').classList.toggle('hidden',!reddit);document.getElementById('localTypeWrap').classList.toggle('hidden',reddit);});
document.getElementById('storyMode').addEventListener('change',()=>{const m=document.getElementById('storyMode').value;const text={full:'Full Story erzählt die Geschichte möglichst abgeschlossen.',question:'Question Ending endet mit einer Frage, damit Leute kommentieren.',soft:'Soft Cliffhanger lässt Spannung offen, aber wirkt nicht zu aggressiv.',hard:'Hard Cliffhanger stoppt vor der Auflösung und sagt Follow for Part 2.',auto:'Auto Mix nutzt zufällig Complete, Question oder Cliffhanger.'};document.getElementById('storyInfo').textContent=text[m];updateLengthInfo();});
function lengthProfile(duration, language='en'){
  const de=language==='de';
  if(Number(duration)<=15) return {name:'Short Hook',duration:'15s',target:42,range:de?'35–40 Wörter':'35–45 words',estimate:'~15s',purpose:de?'Schneller Hook. Gut zum Testen oder für sehr kurze Clips.':'Fast hook. Good for tests or very short clips.'};
  if(Number(duration)<=30) return {name:'Normal Short',duration:'30s',target:85,range:de?'75–90 Wörter':'80–95 words',estimate:'~30s',purpose:de?'Standard für Reddit Shorts. Beste Balance aus Story und Watchtime.':'Default for Reddit Shorts. Best balance of story and watchtime.'};
  return {name:'Long Short',duration:'1:02',target:170,range:de?'140–165 Wörter':'150–180 words',estimate:'~60s',purpose:de?'Längere Story mit mehr Aufbau. Besser, wenn der Hook stark ist.':'Longer story with more setup. Best when the hook is strong.'};
}
function modeLabel(mode){return ({full:'Full Story',question:'Question Ending',soft:'Soft Cliffhanger',hard:'Hard Cliffhanger',auto:'Auto Mix'})[mode]||mode||'Question Ending';}
function modeEffect(mode){return ({full:'erzählt möglichst abgeschlossen',question:'fügt am Ende eine Kommentar-Frage hinzu',soft:'lässt Spannung offen, aber nicht zu hart',hard:'kürzt vor der Auflösung und baut Part-2-Spannung',auto:'wählt automatisch einen passenden Ending-Stil'})[mode]||'nutzt den gewählten Story-Stil';}
function estimateSecondsFromWords(words, language='en'){
  const wps=language==='de'?2.35:2.75;
  return Math.max(1, Math.round(Number(words||0)/wps));
}
function updateLengthInfo(){
  const duration=Number(document.getElementById('duration')?.value||15);
  const language=document.getElementById('language')?.value||'en';
  const mode=document.getElementById('storyMode')?.value||'question';
  const p=lengthProfile(duration,language);
  const info=document.getElementById('lengthInfo');
  if(info){
    info.innerHTML=`<div class="info-top"><b>${p.name}</b><span>${p.duration}</span></div><div class="info-line">Target: ${p.range} · Engine: ${p.target} words</div><small>${modeLabel(mode)}: ${modeEffect(mode)}. ${p.purpose}</small>`;
  }
  const facts=document.getElementById('previewLengthFacts');
  if(facts){
    const currentWords=currentStoryPreview?currentStoryPreview.split(/\s+/).filter(Boolean).length:0;
    const currentEstimate=currentWords?`Preview: ${currentWords} Wörter · geschätzt ${estimateSecondsFromWords(currentWords,language)}s Voice`: 'Preview: noch nicht generiert';
    facts.innerHTML=`<div><b>Target</b><span>${p.duration}</span></div><div><b>Words</b><span>${p.range}</span></div><div><b>Mode</b><span>${modeLabel(mode)}</span></div><div><b>Estimate</b><span>${currentEstimate}</span></div>`;
  }
}

function getConfig(){
  const previewEnabled=!!document.getElementById('storyPreviewEnabled')?.checked;
  const rawStoryType=document.getElementById('storyType').value;const cfg={source:document.getElementById('source').value,storyType:resolveStoryType(rawStoryType),storyTypeRaw:rawStoryType,engineMode:activeEngineMode,channelProfile:activeChannelProfile,storyMode:document.getElementById('storyMode').value,subreddit:document.getElementById('subreddit').value,keywords:document.getElementById('keywords').value,direction:document.getElementById('direction').value||'',language:document.getElementById('language').value,voiceGender:document.getElementById('voiceGender').value,duration:Number(document.getElementById('duration').value),platform:document.getElementById('platform').value,storyPreviewEnabled:previewEnabled};
  if(previewEnabled&&currentStoryPreview){cfg.previewStory=currentStoryPreview;cfg.previewModeTag=currentStoryPreviewMeta?.modeTag||cfg.storyMode;}
  return cfg;
}
function getPreviewConfig(){const cfg={...getConfig()};delete cfg.previewStory;delete cfg.previewModeTag;return cfg;}
function makePreviewSignature(){return JSON.stringify(getPreviewConfig());}
function setStoryPreviewVisible(){const on=!!document.getElementById('storyPreviewEnabled')?.checked;document.getElementById('storyPreviewPanel')?.classList.toggle('hidden',!on);const btn=document.getElementById('btn');if(btn)btn.textContent=on?(currentStoryPreview?'Render Preview Story':'Generate Story Preview'):'Generate Video';}
function clearStoryPreview(){currentStoryPreview='';resolvedRandomStoryType=null;currentStoryPreviewMeta=null;previewConfigSignature='';const text=document.getElementById('storyPreviewText');if(text)text.textContent='Noch keine Preview erstellt.';const meta=document.getElementById('storyPreviewMeta');if(meta)meta.textContent='not generated';updateLengthInfo();setStoryPreviewVisible();}
function makeBrowserFallbackPreview(reason='local fallback'){
  const cfg=getPreviewConfig();
  const isDe=cfg.language==='de';
  const type=cfg.storyType||'story';
  const direction=(cfg.direction||'strong hook').trim();
  const hooks={
    'family-drama': isDe?'Mein Familienessen wurde ruhig, bis jemand vergaß, sein Handy zu sperren.':'My family dinner went quiet when someone forgot to lock their phone.',
    'aita': isDe?'Alle sagten, ich hätte überreagiert, bis sie die Aufnahme hörten.':'Everyone said I overreacted until they heard the recording.',
    'inheritance': isDe?'Der Anwalt sagte einen Satz, der meine ganze Familie plötzlich still machte.':'The lawyer said one sentence that made my whole family go silent.',
    'revenge': isDe?'Ich stritt nicht zurück. Ich wartete nur, bis die Beweise perfekt waren.':'I did not argue back. I just waited until the proof was perfect.',
    'cheating': isDe?'Ich wollte ihm vertrauen, bis das Lieferfoto alles zeigte.':'I wanted to trust them until the delivery photo showed everything.',
    'work-drama': isDe?'Mein Chef schickte die falsche Nachricht an mich, und damit war alles vorbei.':'My boss sent the wrong message to me, and that changed everything.',
    'crazy-neighbor': isDe?'Mein Nachbar log über mich, aber meine Kamera lief die ganze Nacht.':'My neighbor lied about me, but my camera had been running all night.',
    'mystery': isDe?'Ich fand eine Notiz in meiner Wohnung, die ich nie geschrieben hatte.':'I found a note in my apartment that I never wrote.'
  };
  let story=hooks[type]||hooks['family-drama'];
  story += isDe
    ? ` Ich blieb ruhig, prüfte ${direction || 'die Details'} und fand den ersten Beweis. Danach fragte plötzlich niemand mehr, warum ich misstrauisch war. Eine Nachricht, eine Rechnung und ein Foto passten perfekt zusammen. Am Ende war nicht der Betrug das Schlimmste, sondern wie lange alle es gewusst hatten.`
    : ` I stayed calm, checked ${direction || 'the details'}, and found the first piece of proof. After that, nobody asked why I was suspicious anymore. One message, one receipt, and one photo matched perfectly. The worst part was not what they did. It was how long everyone had known.`;
  if(cfg.storyMode==='hard') story += isDe?' Dann kam die letzte Nachricht... Folge für Teil 2.':' Then the final message arrived... Follow for Part 2.';
  if(cfg.storyMode==='question') story += isDe?' Was hättest du getan?':' What would you have done?';
  return {ok:true,fallback:true,warning:reason,story,words:story.split(/\s+/).filter(Boolean).length,modeTag:'browser-fallback',storyType:type,language:cfg.language||'en'};
}
function softClearStoryPreview(){if(!document.getElementById('storyPreviewEnabled')?.checked)return;clearStoryPreview();}
async function loadStoryPreview(regenerate=false){
  const panel=document.getElementById('storyPreviewPanel');if(panel)panel.classList.remove('hidden');
  const meta=document.getElementById('storyPreviewMeta');const text=document.getElementById('storyPreviewText');
  if(text)text.textContent='Story Preview wird erstellt...';if(meta)meta.textContent='generating';
  let data=null;
  try{
    const r=await fetch('/api/story-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...getPreviewConfig(),regenerate})});
    data=await r.json().catch(()=>null);
    if(!r.ok||!data||!data.ok) data=makeBrowserFallbackPreview(data?.error||`HTTP ${r.status}`);
  }catch(err){
    data=makeBrowserFallbackPreview(err?.message||'network fallback');
  }
  currentStoryPreview=data.story||'';currentStoryPreviewMeta=data;previewConfigSignature=makePreviewSignature();
  if(text)text.textContent=currentStoryPreview||'Preview konnte nicht erstellt werden.';
  if(meta)meta.textContent=`${data.words||0} words · ${data.modeTag||'preview'}${data.fallback?' · fallback':''}`;
  updateLengthInfo();
  setStoryPreviewVisible();
  updateQualityDashboard();
  return data;
}
async function generate(){
  const btn=document.getElementById('btn');
  const previewEnabled=!!document.getElementById('storyPreviewEnabled')?.checked;
  if(previewEnabled&&(!currentStoryPreview||previewConfigSignature!==makePreviewSignature())){
    btn.disabled=true;
    const preview=await loadStoryPreview(true);
    btn.disabled=false;
    if(!preview||!currentStoryPreview){document.getElementById('msg').textContent='Preview konnte nicht erstellt werden.';}
    return;
  }
  btn.disabled=true;
  updateQualityDashboard();
  document.getElementById('msg').textContent='Starte Generator...';
  const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(getConfig())});
  if(!r.ok){const data=await r.json().catch(()=>({error:'Fehler'}));alert(data.error||'Generator konnte nicht gestartet werden.');btn.disabled=false;}
}
async function adminLogin(){const user=(document.getElementById('adminUser')?.value||'azuko');const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user})}).then(r=>r.json());if(!r.ok){alert('Access denied');return;}adminUnlocked=true;openPage('admin');loadAdmin();}
function markSteps(stage){const order=['starting','story','voiceover','subtitles','rendering'];for(const id of order){const el=document.getElementById('s-'+id);el.className='step';if(order.indexOf(id)<order.indexOf(stage))el.className='step done';if(id===stage)el.className='step active';if(stage==='done')el.className='step done';}}
function displayName(filename){return filename.replace(/^azuko-/,'').replace(/-\d{8}-\d{4}\.mp4$/,'').replace(/-\d+\.mp4$/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function fileListHtml(videos){return videos.map(x=>`<div class="file"><div><div class="file-name">${displayName(x.name)}</div><div class="file-meta">${x.name} · ${Math.round(x.size/1024/1024)} MB · ${new Date(x.created).toLocaleString()}</div></div><div class="actions"><a class="action" href="${x.url}" target="_blank">Open</a><a class="action" href="/api/download/${encodeURIComponent(x.name)}">Download</a></div></div>`).join('')||'<div class="file"><span class="muted">Noch keine Videos vorhanden.</span></div>';}
function copyText(text){navigator.clipboard.writeText(text||'');}
async function markPosted(id){await fetch('/api/ready/'+id+'/posted',{method:'POST'});await loadReady(true);loadScheduler();}
async function deleteReady(id,title){
  if(!confirm(`Delete this Ready-To-Post item?\n\n${title||''}`))return;
  const r=await fetch('/api/ready/'+id,{method:'DELETE'}).then(r=>r.json()).catch(()=>({ok:false,error:'Delete failed'}));
  if(!r.ok){alert(r.error||'Delete failed');return;}
  await loadReady(true);
  await loadScheduler();
  const toast=document.getElementById('toast');
  if(toast){document.getElementById('toastTitle').textContent='Deleted';document.getElementById('toastText').textContent='Ready-To-Post item wurde gelöscht.';toast.classList.remove('hidden');setTimeout(()=>toast.classList.add('hidden'),2600);}
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function readyHtml(items){
  return items.map(x=>{
    const tt=x.tiktokTitle||x.title||'Untitled';
    const th=x.tiktokHashtags||x.hashtags||'';
    const td=x.tiktokDescription||x.description||'';
    const yt=x.youtubeTitle||x.title||'Untitled';
    const yh=x.youtubeHashtags||x.hashtags||'';
    const copyAll=`${tt}\n\n${td}\n\n${th}`;
    const ytCopy=`${yt}\n\n${x.youtubeDescription||''}\n\n${yh}`;
    return `<article class="ready-video-card ${x.posted?'posted':''}">
      <div class="ready-thumb"><span>${escapeHtml((tt||'A').slice(0,1))}</span><small>${escapeHtml(x.duration||x.targetDuration||'short')}</small></div>
      <div class="ready-content">
        <div class="ready-title-row"><b>${escapeHtml(tt)}</b><span class="status-chip">${x.posted?'posted':'ready'}</span></div>
        <div class="ready-meta">${escapeHtml(x.storyType||'Fake Reddit Story Engine')} · ${escapeHtml(x.storyMode||'story')} · ${x.createdAt?new Date(x.createdAt).toLocaleString():''}</div><div class="ready-quality-row"><span>Story ${qualityEmoji(82)} 82</span><span>Subs ${qualityEmoji(92)} 92</span><span>Clean</span></div>
        <div class="ready-actions actions">
          <a class="action" href="/api/download/${encodeURIComponent(x.videoFile||'')}">Download</a>
          <button class="action" onclick='copyText(${JSON.stringify(ytCopy)})'>YT Ready</button>
          <button class="action primary-small" onclick='copyText(${JSON.stringify(copyAll)})'>TT Ready</button>
          <button class="action" onclick="document.getElementById('details-${escapeHtml(x.id)}').classList.toggle('hidden')">Details</button>
          <button class="action danger" onclick='deleteReady(${JSON.stringify(x.id)},${JSON.stringify(tt)})'>Delete</button>
        </div>
        <div id="details-${escapeHtml(x.id)}" class="ready-details hidden">
          <div><b>Video</b><span>${escapeHtml(x.videoFile||'')}</span></div>
          <div><b>TikTok Caption</b><span>${escapeHtml(td)}</span></div>
          <div><b>TikTok Hashtags</b><span>${escapeHtml(th)}</span></div>
          <div><b>YouTube Title</b><span>${escapeHtml(yt)}</span></div>
          <div><b>YouTube Schedule</b><span>${escapeHtml((x.youtubeSchedule&&x.youtubeSchedule.scheduledTime)||'Auto next slot')} · ${escapeHtml((x.youtubeSchedule&&x.youtubeSchedule.status)||'prepared')}</span></div>
        </div>
      </div>
    </article>`;
  }).join('')||'<div class="file"><span class="muted">Noch nichts Ready To Post.</span></div>';
}
async function loadReady(force=false){const ready=await fetch('/api/ready').then(r=>r.json()).catch(()=>[]);const readyCountEl=document.getElementById('readyCount');if(readyCountEl)readyCountEl.textContent=ready.filter(x=>!x.posted).length;const statReadyEl=document.getElementById('statReady');if(statReadyEl)statReadyEl.textContent=ready.length;const sig=ready.map(x=>`${x.id}:${x.posted}:${x.videoFile}`).join('|');if(!force&&sig===lastReadySignature)return;lastReadySignature=sig;const readyAllEl=document.getElementById('ready-all');if(readyAllEl)readyAllEl.innerHTML=readyHtml(ready);}
function updateVideos(videos){const sig=videos.map(v=>`${v.name}:${v.size}`).join('|');if(sig===lastVideoSignature)return;lastVideoSignature=sig;document.getElementById('videos-all').innerHTML=fileListHtml(videos);document.getElementById('statVideos').textContent=videos.length;const total=videos.reduce((sum,v)=>sum+(v.size||0),0);document.getElementById('statSize').textContent=Math.round(total/1024/1024)+' MB';}
function channelHtml(c){if(!c)return '<div class="file"><span class="muted">Keine Channel-Daten.</span></div>';const current=c.current||{};const ready=(c.recentReady||[]).map(x=>`<div class="mini-item"><b>${x.title||x.videoFile}</b><span>${x.videoFile||''} · ${x.posted?'posted':'ready'}</span></div>`).join('')||'<span class="muted">Noch keine Ready Items.</span>';const videos=(c.recentVideos||[]).map(x=>`<div class="mini-item"><b>${x.name}</b><span>${Math.round((x.size||0)/1024/1024)} MB</span></div>`).join('')||'<span class="muted">Noch keine Videos.</span>';const bgs=(c.backgrounds||[]).map(x=>`<div class="mini-item"><b>${x.name}</b><span>${Math.round((x.size||0)/1024/1024)} MB</span></div>`).join('')||'<span class="muted">Keine Backgrounds gefunden.</span>';return `<div class="channel-current"><div><b>${current.running?'LÄUFT':'BEREIT'}</b><span>${current.stage||'idle'} · ${current.progress||0}%</span></div><p>${current.message||'Bereit'}</p><small>Background-Ordner: ${c.backgroundsPath}</small></div><div class="three"><div><h3>Ready</h3>${ready}</div><div><h3>Videos</h3>${videos}</div><div><h3>Backgrounds</h3>${bgs}</div></div>`;}async function loadScheduler(){const s=await fetch('/api/youtube-schedule').then(r=>r.json()).catch(()=>({items:[],channels:[]}));const y=document.getElementById('ytSchedule');if(y)y.innerHTML=youtubeScheduleHtml(s.items);const c=document.getElementById('channelAccounts');if(c)c.innerHTML=channelsHtml(s.channels);}
function metricCard(label,value,sub=''){
  return `<div class="metric-card"><span>${label}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`;
}
function rowsHtml(obj){
  return Object.entries(obj||{}).map(([k,v])=>`<div class="row"><b>${k}</b><span>${v}</span></div>`).join('');
}
function activityHtml(items){
  return (items||[]).map(x=>`<div class="activity-item ${x.status||'ok'}"><span></span><div><b>${x.label}</b><small>${x.value}</small></div></div>`).join('')||'<div class="file"><span class="muted">Keine Aktivität.</span></div>';
}
function changelogHtml(items){
  return (items||[]).map(v=>{const meta=[v.title,v.date].filter(Boolean).join(' · ');return `<div class="change-card"><div class="change-head"><b>${v.version}</b><span>${meta}</span></div><ul>${(v.items||[]).map(i=>`<li>${i}</li>`).join('')}</ul></div>`}).join('');
}
function assetsHtml(a){
  const files=(a.recentBackgrounds||[]).map(x=>`<div class="mini-item"><b>${x.name}</b><span>${Math.round((x.size||0)/1024/1024)} MB</span></div>`).join('')||'<span class="muted">Keine Backgrounds gefunden.</span>';
  return `<div class="row"><b>Status</b><span>${a.usingDesktopBackgrounds?'Desktop Folder verbunden ✅':'Projekt-Folder aktiv'}</span></div><div class="row"><b>Background Videos</b><span>${a.backgroundsCount}</span></div><div class="row"><b>Background Size</b><span>${Math.round((a.backgroundsSize||0)/1024/1024)} MB</span></div><div class="row"><b>Folder</b><span>${a.backgroundsPath}</span></div><div class="asset-list">${files}</div>`;
}
function errorCenterHtml(e){
  const items=(e?.items||[]).map(x=>`<div class="activity-item bad"><span></span><div><b>${x.label}${x.time?` · ${x.time}`:''}</b><small>${x.value}</small></div></div>`).join('');
  if(!e||!e.count)return '<div class="empty-good">✅ No errors. System clean.</div>';
  return `<div class="error-summary">${e.count} problem${e.count===1?'':'s'} found</div><div class="activity-list">${items}</div>`;
}
function accountsHtml(a){
  const y=a?.youtube||{}; const t=a?.tiktok||{};
  return `<div class="row"><b>YouTube</b><span>${y.status||'prepared'} · ${y.label||'Prepared'}</span></div><div class="row"><b>TikTok</b><span>${t.status||'ready'} · ${t.label||'Ready-To-Post'}</span></div>`;
}
async function loadAdmin(){
  const a=await fetch('/api/admin').then(r=>r.json()).catch(()=>null);if(!a)return;
  const last=document.getElementById('adminLastUpdated');if(last)last.textContent='Last Updated: '+(a.lastUpdated||'Today');
  document.getElementById('adminDashboard').innerHTML=[
    metricCard('System',a.dashboard?.systemStatus||'Online'),
    metricCard('Videos Created',a.dashboard?.videosCreated||0),
    metricCard('Ready To Post',a.dashboard?.readyToPost||0),
    metricCard('YouTube Scheduled',a.dashboard?.youtubeScheduled||0),
    metricCard('Background Videos',a.dashboard?.backgroundVideos||0),
    metricCard('Errors',a.errorCenter?.count||0,a.errorCenter?.status||'clean')
  ].join('');
  document.getElementById('adminLiveActivity').innerHTML=activityHtml(a.liveActivity);
  document.getElementById('adminChangelog').innerHTML=changelogHtml(a.changelog);
  document.getElementById('adminStats').innerHTML=rowsHtml({
    'Total Videos':a.statistics?.totalVideos||0,
    'Total Renders':a.statistics?.totalRenders||0,
    'Ready Items':a.statistics?.readyItems||0,
    'Posted Items':a.statistics?.postedItems||0,
    'YouTube Prepared':a.statistics?.youtubePrepared||0,
    'Errors':a.statistics?.errorCount||0,
    'Average Render Time':a.statistics?.averageRenderTime||'Coming soon',
    'Most Used Category':a.statistics?.mostUsedCategory||'Noch keine Daten',
    'Video Storage':Math.round((a.statistics?.videosSize||0)/1024/1024)+' MB'
  });
  document.getElementById('adminAssets').innerHTML=assetsHtml(a.assets||{});
  document.getElementById('adminSystem').innerHTML=rowsHtml({
    'Version':a.version,
    'Node':a.system?.node||'OK',
    'Dashboard':a.system?.dashboard,
    'Generator':a.system?.generator,
    'Background Path':a.system?.backgroundsPath,
    'Ready Path':a.system?.readyPath,
    'Generated Path':a.system?.generatedPath
  });
  document.getElementById('adminScheduler').innerHTML=youtubeScheduleHtml(a.youtubeSchedule||[]);
  const err=document.getElementById('adminErrors');if(err)err.innerHTML=errorCenterHtml(a.errorCenter);
  const acc=document.getElementById('adminAccounts');if(acc)acc.innerHTML=accountsHtml(a.connectedAccounts);
  const set=document.getElementById('adminSettings');if(set)set.innerHTML=settingsHtml(a);
  const links=document.getElementById('adminLinks');if(links)links.innerHTML=linksHtml(a);
  const backup=document.getElementById('adminBackup');if(backup)backup.innerHTML=backupHtml(a);
  const cleanup=document.getElementById('adminCleanup');if(cleanup)cleanup.innerHTML=cleanupHtml(a);const cleanupMirror=document.getElementById('adminCleanupMirror');if(cleanupMirror)cleanupMirror.innerHTML=cleanupHtml(a);
  const lab=document.getElementById('adminLab');if(lab)lab.innerHTML=labHtml();
}
function closeToast(){document.getElementById('toast')?.classList.add('hidden');}
function showToast(videoFile){const t=document.getElementById('toast');document.getElementById('toastTitle').textContent='Video fertig ✅';document.getElementById('toastText').textContent=videoFile;document.getElementById('toastDownload').href='/api/download/'+encodeURIComponent(videoFile);t.classList.remove('hidden');}
async function loadModules(){
  const remote=await fetch('/api/modules').then(r=>r.json()).catch(()=>[]);
  const modules=(remote&&remote.length)?remote:AZUKO_ENGINE_DEFS.map(e=>({id:e.id==='reddit'?'fake-reddit':e.id,icon:e.icon,title:e.title,description:e.desc,status:e.status==='active'?'active':'prepared',statusLabel:e.status}));
  const el=document.getElementById('modules');
  if(el)el.innerHTML=modules.map(m=>`<div class="module-card engine-card" onclick="moduleClick('${m.id}','${m.status}')"><div class="engine-icon">${m.icon||'⚙'}</div><b>${m.title}</b><p>${m.description}</p><span class="module-status ${m.status==='active'?'active':''}">${m.statusLabel||m.status}</span></div>`).join('');
  renderEngineHub();
}
function moduleClick(id,status){
  if(id==='fake-reddit'||id==='reddit'){setEngineMode('reddit');openPage('create');document.getElementById('source').value='local';return;}
  if(id==='roblox'){setEngineMode('roblox');openPage('create');return;}
  if(id==='fruits'){setEngineMode('fruits');openPage('create');return;}
  if(id==='ad'){setEngineMode('ad');openPage('engines');return;}
  alert('Diese Azuko Engine ist vorbereitet, aber noch nicht aktiv.');
}
function renderOverview(status={}, videos=[]){
  const readyCount=Number(document.getElementById('readyCount')?.textContent||0);
  const metrics=document.getElementById('overviewMetrics');
  const profile=AZUKO_V2_PROFILES[activeChannelProfile]?.label||activeChannelProfile;
  if(metrics)metrics.innerHTML=[
    metricCard('Videos',videos.length,'local'),
    metricCard('Ready',readyCount,'post queue'),
    metricCard('Profile',profile,'active'),
    metricCard('Engine',activeEngineMode,'selected')
  ].join('');
  const sys=document.getElementById('overviewSystem');
  if(sys)sys.innerHTML=[
    '<div><b>Subtitle Engine V2</b><span>Readable speed first</span></div>',
    '<div><b>Engine Hub</b><span>Reddit · Roblox · Fruits</span></div>',
    '<div><b>Gangster Fruits</b><span>Character foundation ready</span></div>',
    '<div><b>HighPerformerNetwork</b><span>Brand link active</span></div>'
  ].join('');
  const startup=document.getElementById('startupStatus');
  if(startup)startup.textContent=status.stage==='error'?'Needs attention':'All systems ready';
  updateQualityDashboard();
}
function settingsHtml(a){return `<div class="setting-stack"><div><b>Workspace</b><span>Local · SaaS Foundation</span></div><div><b>User</b><span>Azuko · verified High Performer</span></div><div><b>Mode</b><span>SaaS vibe + Work mode preparation</span></div><div><b>Branding</b><span>Azuko Generation LLC · powered by HighPerformerNetwork</span></div></div>`;}
function linksHtml(a){
  const s=a.settings||{}; const links=s.socialLinks||{};
  return `<p class="muted">Diese Links steuern die Buttons für Twitch, TikTok, YouTube, Discord und Contact. Leer lassen = Button bleibt vorbereitet, aber ohne Link.</p>
  <div class="link-settings-grid">
    <label>Twitch Link<input id="linkTwitch" value="${escapeHtml(links.twitch||'')}" placeholder="https://twitch.tv/..."></label>
    <label>TikTok Link<input id="linkTikTok" value="${escapeHtml(links.tiktok||'')}" placeholder="https://tiktok.com/@..."></label>
    <label>YouTube Link<input id="linkYouTube" value="${escapeHtml(links.youtube||'')}" placeholder="https://youtube.com/@..."></label>
    <label>Discord Server<input id="linkDiscord" value="${escapeHtml(links.discord||'')}" placeholder="https://discord.gg/..."></label>
    <label>Contact Email<input id="contactEmail" value="${escapeHtml(s.contactEmail||'')}" placeholder="contact@example.com"></label>
  </div>
  <div class="actions" style="margin-top:12px"><button class="action primary-small" onclick="saveStudioLinks()">Save Links</button><button class="action" onclick="previewStudioLinks()">Preview Buttons</button></div>
  <div id="linksResult" class="hint"></div>
  <div id="linksPreview" class="social-preview"></div>`;
}
function collectStudioLinks(){return {socialLinks:{twitch:document.getElementById('linkTwitch')?.value||'',tiktok:document.getElementById('linkTikTok')?.value||'',youtube:document.getElementById('linkYouTube')?.value||'',discord:document.getElementById('linkDiscord')?.value||''},contactEmail:document.getElementById('contactEmail')?.value||''};}
async function saveStudioLinks(){const payload=collectStudioLinks();const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.json()).catch(()=>({ok:false}));document.getElementById('linksResult').textContent=r.ok?'Saved. Buttons updated from Settings.':'Could not save.'; if(r.ok)renderLoginFooter(r.settings||payload);}
function previewStudioLinks(){const data=collectStudioLinks();const links=data.socialLinks||{};const buttons=[['Twitch',links.twitch],['TikTok',links.tiktok],['YouTube',links.youtube],['Discord',links.discord],['Contact',data.contactEmail?`mailto:${data.contactEmail}`:'']];document.getElementById('linksPreview').innerHTML=buttons.map(([name,url])=>`<a class="social-pill ${url?'':'disabled'}" ${url?`href="${escapeHtml(url)}" target="_blank"`:''}>${name}</a>`).join('');}

function backupHtml(a){return `<p class="muted">Creates a backup of settings, config, story history and metadata. Large background videos are not copied.</p><div class="actions"><button class="action primary-small" onclick="createBackup()">Create Backup</button><button class="action" onclick="alert('Backup folder: backups/ inside web-app')">Open Backup Folder</button></div><div id="backupResult" class="hint"></div>`;}
function cleanupHtml(a){const days=a.settings?.cleanupDays||14;return `<p class="muted">Local finished videos can be cleaned after X days. Metadata can stay for tracking.</p><select id="cleanupDays"><option ${days==7?'selected':''}>7</option><option ${days==14?'selected':''}>14</option><option ${days==30?'selected':''}>30</option><option ${days==='Never'?'selected':''}>Never</option></select><button class="action" style="margin-top:10px" onclick="saveCleanupDays()">Save Cleanup Setting</button><div id="cleanupResult" class="hint"></div>`;}
function labHtml(){return `<p class="muted">Protected experiment area for hooks, subtitles, voices, Roblox Rant styles, Fruit cards and Ad Engine prompts.</p><input id="labCode" placeholder="Code" value="44"><button class="action primary-small" style="margin-top:10px" onclick="enterLab()">Enter Lab</button><div id="labResult" class="hint"></div>`;}
async function createBackup(){const r=await fetch('/api/backup',{method:'POST'}).then(r=>r.json()).catch(()=>({ok:false,error:'Backup failed'}));document.getElementById('backupResult').textContent=r.ok?`Backup created: ${r.name}`:(r.error||'Backup failed');}
async function saveCleanupDays(){const v=document.getElementById('cleanupDays').value;const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cleanupDays:v})}).then(r=>r.json()).catch(()=>({ok:false}));document.getElementById('cleanupResult').textContent=r.ok?'Saved.':'Could not save.';}
function enterLab(){const v=document.getElementById('labCode').value.trim();document.getElementById('labResult').textContent=v==='44'?'Azuko Engine Lab unlocked. Experiments coming later.':'Wrong code.';}

let publicSettingsCache = {contactEmail:'', socialLinks:{}};
function renderLoginFooter(settings={}){
  publicSettingsCache = settings || publicSettingsCache;
  const links=(publicSettingsCache.socialLinks||{});
  const contact=publicSettingsCache.contactEmail||'';
  const buttons=[['Twitch',links.twitch],['TikTok',links.tiktok],['YouTube',links.youtube],['Discord',links.discord],['Contact',contact?`mailto:${contact}`:'']];
  const el=document.getElementById('loginSocials');
  if(el)el.innerHTML=buttons.map(([name,url])=>url?`<a href="${escapeHtml(url)}" target="_blank">${name}</a>`:`<span>${name}</span>`).join('');
}
async function loadPublicSettings(){
  const s=await fetch('/api/settings').then(r=>r.json()).catch(()=>({contactEmail:'',socialLinks:{}}));
  renderLoginFooter(s);
}
function showLoginInfo(type){
  const modal=document.getElementById('loginInfoModal');
  const title=document.getElementById('loginInfoTitle');
  const text=document.getElementById('loginInfoText');
  const action=document.getElementById('loginInfoAction');
  const email=publicSettingsCache.contactEmail||'';
  const map={
    about:['About','Azuko Generation LLC ist ein lokales Creator- und Content-Factory-Dashboard, powered by HighPerformerNetwork. Die Azuko Engine steuert Engines, Videos, Ready-To-Post und spätere Plattformfunktionen.'],
    impressum:['Impressum','Impressum-Platzhalter für die lokale Entwicklungs-Version. Echte Angaben können später im Settings gepflegt werden.'],
    contact:['Contact',email?`Kontakt: ${email}`:'Noch keine Contact Email hinterlegt. Du kannst sie im Settings unter Social Links & Contact eintragen.']
  };
  const data=map[type]||map.about;
  title.textContent=data[0]; text.textContent=data[1];
  action.innerHTML=(type==='contact'&&email)?`<a class="social-pill" href="mailto:${escapeHtml(email)}">Email öffnen</a>`:'';
  modal?.classList.remove('hidden');
}
function closeLoginInfo(){document.getElementById('loginInfoModal')?.classList.add('hidden');}

function enterAzukoLogin(){
  const user=(document.getElementById('loginUser')?.value||'').trim().toLowerCase();
  if(user!=='azuko'){alert('User not verified. Use Azuko.');return;}
  document.getElementById('loginVerified')?.classList.remove('hidden');
  localStorage.setItem('azukoVerified','1');
  setTimeout(()=>{document.getElementById('loginScreen')?.classList.add('hidden');document.querySelector('.app')?.classList.remove('app-hidden');},950);
}
function initLogin(){
  // v1.9.3: Always show login first for a clean SaaS-style start.
  localStorage.removeItem('azukoVerified');
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.querySelector('.app')?.classList.add('app-hidden');
  document.getElementById('loginUser')?.addEventListener('keydown',e=>{if(e.key==='Enter')enterAzukoLogin();});
}
async function tick(){const s=await fetch('/api/status').then(r=>r.json()).catch(()=>({stage:'idle',progress:0,message:'Bereit'}));const stage=s.stage||'idle';const stageEl=document.getElementById('stage');if(stageEl)stageEl.textContent=stage==='done'?'Done':stage;document.getElementById('msg').textContent=s.message||'Bereit';const progressEl=document.getElementById('progress');if(progressEl)progressEl.textContent=(s.progress||0)+'%';const fillEl=document.getElementById('fill');if(fillEl)fillEl.style.width=(s.progress||0)+'%';const btnEl=document.getElementById('btn');if(btnEl)btnEl.disabled=!!s.running;markSteps(stage);const code=document.getElementById('liveCodeLog');if(code)code.textContent=stageToCode(s);if(stage==='done'&&s.output&&s.output!==lastDoneOutput){lastDoneOutput=s.output;showToast(s.output.split(/[\\/]/).pop());}const v=await fetch('/api/videos').then(r=>r.json()).catch(()=>[]);const countEl=document.getElementById('count');if(countEl)countEl.textContent=v.length;updateVideos(v);loadReady();renderOverview(s,v);}
document.getElementById('storyPreviewEnabled')?.addEventListener('change',()=>{setStoryPreviewVisible();if(document.getElementById('storyPreviewEnabled').checked&&!currentStoryPreview)loadStoryPreview(true);});
document.querySelectorAll('#page-create select,#page-create input,#page-create textarea').forEach(el=>{if(el.id==='storyPreviewEnabled'||el.id==='adminUser')return;el.addEventListener('change',softClearStoryPreview);el.addEventListener('input',()=>{if(el.tagName==='TEXTAREA'||el.tagName==='INPUT')softClearStoryPreview();});});
loadPublicSettings();initLogin();setProcessMode(processMode);setStoryPreviewVisible();updateLengthInfo();
const profileSelect=document.getElementById('channelProfile');if(profileSelect)profileSelect.value=activeChannelProfile;
const engineSelect=document.getElementById('engineMode');if(engineSelect)engineSelect.value=activeEngineMode;
renderEngineHub();updateQualityDashboard();loadModules();loadScheduler();setInterval(tick,1500);tick();

// v2.0 compatibility: old quality ids are replaced by updateQualityDashboard().
document.addEventListener('DOMContentLoaded',()=>{renderEngineHub();updateQualityDashboard();});
