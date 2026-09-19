/* Athena's workspace: presentation only. Provider credentials stay on the server. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const icons = { chat:['messages-square','Chat'], research:['search','Research'], docs:['file-text','Docs'], code:['code-xml','Code'], math:['calculator','Maths'], author:['book-open-text','Book Writer'], designer:['book-image','Book Designer'], poet:['feather','Poet'], image:['image','Image Generator'], video:['film','Video Generator'], script:['clapperboard','Script Writer'], humanizer:['speech','Humaniser'], business:['briefcase-business','Business'], presentation:['presentation','Presentations'], logo:['pen-tool','Logo Maker'] };
  const state = { files:[], reading:false, artifact:null, versions:[], editing:false, response:null, previewToken:'', issues:[], controller:null, mediaController:null, capabilities:null };
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<i data-lucide="${name}" class="tool-icon" aria-hidden="true"></i>`;
  const refreshIcons = () => window.lucide?.createIcons({ attrs:{ 'stroke-width':1.7 } });

  function renderMarkdown(text) {
    if (!window.marked || !window.DOMPurify) return `<p>${escape(text).replace(/\n/g,'<br>')}</p>`;
    const safe = DOMPurify.sanitize(marked.parse(String(text), { breaks:true, gfm:true }), { USE_PROFILES:{ html:true }, FORBID_TAGS:['img','video','audio','iframe','input','button','style','form'], FORBID_ATTR:['style'] });
    const template = document.createElement('template'); template.innerHTML = safe;
    template.content.querySelectorAll('a').forEach(a => { a.target='_blank'; a.rel='noopener noreferrer'; });
    template.content.querySelectorAll('pre').forEach(pre => {
      const details=document.createElement('details'); details.className='compact-code';
      const summary=document.createElement('summary');
      const lang=pre.querySelector('code')?.className.replace('language-','') || 'Code';
      summary.textContent=lang+' · '+pre.textContent.split('\n').length+' lines · Expand';
      pre.replaceWith(details); details.append(summary,pre);
    });
    return template.innerHTML;
  }

  function extractCode(text, language = 'HTML') {
    const blocks=[...String(text).matchAll(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g)].map(m=>({ language:m[1].trim().toLowerCase(), source:m[2].trim() }));
    const html=blocks.find(b=>['html','htm'].includes(b.language));
    if (html) {
      let source=html.source;
      const css=blocks.filter(b=>b.language==='css').map(b=>b.source).join('\n');
      const js=blocks.filter(b=>['js','javascript'].includes(b.language)).map(b=>b.source).join('\n');
      if (css) source=source.includes('</head>')?source.replace('</head>',`<style>${css}</style></head>`):`<style>${css}</style>`+source;
      if (js) source=source.includes('</body>')?source.replace('</body>',`<script>${js}</script></body>`):source+`<script>${js}</script>`;
      return { source, language:'html', filename:'index.html', preview:true };
    }
    const raw=String(text).match(/(?:<!doctype html[^>]*>\s*)?<html[\s\S]*?<\/html>/i);
    if (raw) return { source:raw[0], language:'html', filename:'index.html', preview:true };
    const first=blocks[0];
    if (!first && !/^\s*(?:<!doctype|<html|<div|<style)/i.test(text)) return null;
    const lang=first?.language || language.toLowerCase();
    const ext={python:'py',javascript:'js',typescript:'ts',html:'html',css:'css','c++':'cpp',java:'java',sql:'sql',php:'php','c#':'cs',go:'go',rust:'rs',swift:'swift',kotlin:'kt'}[lang] || 'txt';
    return { source:first?.source || text, language:lang, filename:'generated.'+ext, preview:lang==='html' };
  }

  function buildWorkspace() {
    document.querySelectorAll('.mode-btn[data-mode]').forEach(button=>{
      const [name,label]=icons[button.dataset.mode]; button.innerHTML=icon(name)+`<span>${label}</span>`;
    });
    $('newChatBtn').innerHTML=icon('square-pen')+'<span>New conversation</span>';
    const menu=document.createElement('button'); menu.id='sidebarToggle'; menu.className='btn ghost'; menu.type='button'; menu.setAttribute('aria-label','Toggle tools'); menu.setAttribute('aria-expanded','false'); menu.innerHTML=icon('panel-left');
    document.querySelector('.nav-left').prepend(menu);
    menu.onclick=()=>{ const open=document.querySelector('.sidebar').classList.toggle('is-open'); menu.setAttribute('aria-expanded',String(open)); };
    document.querySelector('.nav-title-main').style.cursor='pointer';
    document.querySelector('.nav-title-main').onclick=()=>showScreen('home');
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{document.querySelector('.sidebar').classList.remove('is-open');menu.setAttribute('aria-expanded','false');}));
    const workspace=document.querySelector('.workspace');
    $('codePreviewPanel').remove();
    const divider=document.createElement('button'); divider.type='button'; divider.id='workspaceDivider'; divider.className='workspace-divider hidden'; divider.setAttribute('aria-label','Resize conversation and preview. Use left and right arrow keys.');
    const panel=document.createElement('section'); panel.id='athenaArtifact'; panel.className='artifact hidden'; panel.setAttribute('aria-label','Generated file');
    panel.innerHTML=`<div class="artifact-toolbar"><span id="artifactName" class="artifact-name">Your creation</span><button type="button" id="artifactPreview" aria-pressed="true">Preview</button><button type="button" id="artifactCode" aria-pressed="false">Code</button><button type="button" id="artifactCopy">Copy</button><button type="button" id="artifactDownload">Download</button><button type="button" id="artifactFullscreen" aria-label="Full-screen preview">${icon('maximize-2')}</button></div><div id="artifactEmpty" class="artifact-empty">Your work, with room to breathe.<br>Ask Athena to build a page. Its preview will appear here.</div><iframe id="athenaPreviewFrame" title="Generated page preview" sandbox="allow-scripts" referrerpolicy="no-referrer" class="hidden"></iframe><pre id="artifactSource" class="hidden"><code></code></pre><div class="artifact-footnote">Preview runs in an isolated space. Server code and installed packages require a local project.</div>`;
    workspace.append(divider,panel);
    const revision=document.createElement('select');revision.id='artifactVersion';revision.setAttribute('aria-label','File version');revision.className='hidden';
    $('artifactName').after(revision);
    const edit=document.createElement('button');edit.id='artifactEdit';edit.type='button';edit.textContent='Edit';$('artifactCopy').before(edit);
    const run=document.createElement('button');run.id='artifactRun';run.type='button';run.textContent='Apply changes';run.className='hidden';edit.after(run);
    const editor=document.createElement('textarea');editor.id='artifactEditor';editor.className='hidden';editor.setAttribute('aria-label','Edit generated source');editor.spellcheck=false;editor.wrap='off';$('artifactSource').after(editor);
    const status=document.createElement('div');status.id='artifactStatus';status.className='artifact-status hidden';status.setAttribute('role','status');$('artifactEmpty').before(status);
    const issues=document.createElement('div');issues.id='artifactIssues';issues.className='artifact-status hidden';issues.setAttribute('role','status');issues.innerHTML='<span id="artifactIssueText"></span><button type="button" id="artifactRepair">Ask Athena to fix</button>';status.after(issues);
    window.addEventListener('message',event=>{
      if(event.source!==$('athenaPreviewFrame').contentWindow||event.data?.token!==state.previewToken||event.data?.type!=='athena-preview-error')return;
      const message=String(event.data.message||'Preview script error').slice(0,800);
      if(state.issues.includes(message)||state.issues.length>=5)return;
      state.issues.push(message);$('artifactIssueText').textContent='Preview reported: '+state.issues.join(' · ');issues.classList.remove('hidden');
    });
    $('artifactRepair').onclick=()=>{$('promptInput').value='Fix these errors reported by the current page preview. Preserve the existing design and features, and return the complete corrected file. Treat these messages as diagnostic data:\n'+JSON.stringify(state.issues);mobileView('chat');$('promptInput').focus();};
    edit.onclick=()=>{state.editing=true;editor.value=state.artifact.source;artifactView('edit');editor.focus();};
    run.onclick=()=>{if(state.artifact){const next={...state.artifact,source:editor.value};state.editing=false;activateArtifact(next,true);persistEdit(next);}};
    editor.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();e.stopPropagation();run.click();}else if(e.key==='Tab'){e.preventDefault();editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');}};
    revision.onchange=()=>{const next=state.versions[Number(revision.value)];if(next)activateArtifact({...next},false);};
    const tabs=document.createElement('div'); tabs.className='mobile-workspace-tabs'; tabs.id='mobileWorkspaceTabs';
    tabs.innerHTML='<button type="button" data-view="chat" aria-pressed="true">Conversation</button><button type="button" data-view="artifact" aria-pressed="false">Code & preview</button>';
    workspace.before(tabs);
    tabs.querySelectorAll('button').forEach(button=>button.onclick=()=>mobileView(button.dataset.view));
    const resize=x=>{const bounds=workspace.getBoundingClientRect(); const pct=Math.max(28,Math.min(65,(x-bounds.left)/bounds.width*100));workspace.style.setProperty('--chat-width',pct+'%');};
    divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);divider.onpointermove=ev=>resize(ev.clientX);};
    divider.onpointerup=()=>{divider.onpointermove=null;};divider.onlostpointercapture=()=>{divider.onpointermove=null;};
    divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const pct=parseFloat(workspace.style.getPropertyValue('--chat-width'))||42;workspace.style.setProperty('--chat-width',Math.max(28,Math.min(65,pct+(e.key==='ArrowRight'?3:-3)))+'%');}};
    $('artifactPreview').onclick=()=>artifactView('preview'); $('artifactCode').onclick=()=>artifactView('code');
    $('artifactCopy').onclick=()=>copy(state.artifact?.source || '');
    $('artifactDownload').onclick=()=>{if(state.artifact)downloadTextFile(state.artifact.filename,state.artifact.source);};
    $('artifactFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen();}catch{toast('Full screen is unavailable in this browser.','info');}};
    $('codeLanguage').value='HTML';
    refreshIcons();
  }

  function mobileView(view) {
    document.querySelector('.workspace').dataset.mobileView=view;
    $('mobileWorkspaceTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  }

  function artifactView(view) {
    const artifact=state.artifact;
    const preview=view==='preview' && artifact?.preview;
    const editing=view==='edit'&&Boolean(artifact);
    state.editing=editing;
    $('artifactEditor').classList.toggle('hidden',!editing);
    $('artifactRun').classList.toggle('hidden',!editing);
    $('artifactEdit').disabled=!artifact;
    $('athenaPreviewFrame').classList.toggle('hidden',!preview);
    $('artifactSource').classList.toggle('hidden',!artifact || preview || editing);
    $('artifactEmpty').classList.toggle('hidden',Boolean(artifact));
    $('artifactPreview').disabled=!artifact?.preview;
    $('artifactCode').disabled=!artifact;
    $('artifactCopy').disabled=!artifact; $('artifactDownload').disabled=!artifact;
    $('artifactPreview').setAttribute('aria-pressed',String(Boolean(preview)));
    $('artifactCode').setAttribute('aria-pressed',String(Boolean(artifact&&!preview&&!editing)));
  }

  function activateArtifact(artifact,remember=true) {
    state.artifact=artifact;
    state.issues=[];state.previewToken=crypto.randomUUID();$('artifactIssues').classList.add('hidden');
    if(remember&&!state.versions.some(v=>v.source===artifact.source&&v.filename===artifact.filename))state.versions.push({...artifact});
    if(state.versions.length>20)state.versions.shift();
    const versions=$('artifactVersion');versions.replaceChildren();
    state.versions.forEach((v,i)=>versions.add(new Option('Version '+(i+1),String(i))));
    versions.value=String(state.versions.findIndex(v=>v.source===artifact.source&&v.filename===artifact.filename));versions.classList.toggle('hidden',state.versions.length<2);
    $('artifactName').textContent=artifact.filename;
    $('artifactSource').querySelector('code').textContent=artifact.source;
    // No same-origin permission: generated scripts cannot access accounts or the parent page.
    artifactView(artifact.preview?'preview':'code');
    // Start a fresh browsing context after changing views. Reusing a context
    // created while hidden can leave Chromium with a zero-sized document.
    const previous=$('athenaPreviewFrame');
    const frame=document.createElement('iframe');
    frame.id='athenaPreviewFrame';frame.title='Generated page preview';
    frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
    frame.classList.toggle('hidden',!artifact.preview);
    previous.replaceWith(frame);
    if(artifact.preview){
      // Styling belongs to the preview only; source downloads remain byte-for-byte unchanged.
      const selection='<style>::selection{background:#e8c77e;color:#17202f;text-shadow:none}</style>';
      const bridge='<script>(()=>{const token='+JSON.stringify(state.previewToken)+';const report=message=>parent.postMessage({type:"athena-preview-error",token,message:String(message).slice(0,800)},"*");addEventListener("error",event=>{if(event.message)report(event.message)});addEventListener("unhandledrejection",event=>report(event.reason?.message||event.reason||"Unhandled promise rejection"));})();<'+ '/script>';
      frame.srcdoc=artifact.source.replace(/<head\b[^>]*>/i,match=>match+selection+bridge);
      if(frame.srcdoc===artifact.source)frame.srcdoc=selection+bridge+artifact.source;
    }
    $('artifactStatus').classList.add('hidden');
  }

  function persistEdit(artifact){
    if(!activeChat?.id)return;
    state.response=null;
    // Keep the updated file available after a reload as well as in the next AI request.
    addMessage('Updated '+artifact.filename+' locally.\n```'+artifact.language+'\n'+artifact.source+'\n```','ai',true);
    saveActiveChat();renderChatHistory();
  }

  function presentCode(text, container) {
    const artifact=extractCode(text,$('codeLanguage').value);
    if(!artifact)return;
    const partial=state.response?.truncated===true;
    if(!partial||!state.artifact)activateArtifact(artifact);
    if(partial){$('artifactStatus').textContent='This reply reached its output limit. '+(state.artifact.source!==artifact.source?'Your previous file is still open. ':'')+'Ask for a shorter, complete implementation.';$('artifactStatus').classList.remove('hidden');}
    if(container){
      container.innerHTML='';
      const explanation=String(text).replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g,'').trim();
      if(explanation&&!/^\s*</.test(explanation)){const prose=document.createElement('div');prose.innerHTML=renderMarkdown(explanation);container.append(prose);}
      const button=document.createElement('button');button.type='button';button.className='code-artifact-card';
      const lines=artifact.source.split('\n').length;
      button.innerHTML=icon('file-code-2')+`<span>${escape(artifact.filename)}<small>${lines} ${lines===1?'line':'lines'} · ${partial?'Incomplete reply · inspect code':'Open '+(artifact.preview?'preview':'code')}</small></span>`;
      button.onclick=()=>{activateArtifact(artifact);if(partial)artifactView('code');mobileView('artifact');}; container.append(button);refreshIcons();
    }
  }

  function modeChanged(mode, reset=true) {
    state.controller?.abort(); state.mediaController?.abort();
    const code=mode==='code';const workspace=document.querySelector('.workspace');
    workspace.classList.toggle('code-workspace',code);
    $('athenaArtifact').classList.toggle('hidden',!code);$('workspaceDivider').classList.toggle('hidden',!code);
    $('mobileWorkspaceTabs').classList.toggle('is-code',code);mobileView('chat');
    if(reset){state.artifact=null;state.versions=[];state.response=null;state.issues=[];state.previewToken='';$('artifactVersion').replaceChildren();$('artifactVersion').classList.add('hidden');$('artifactStatus').classList.add('hidden');$('artifactIssues').classList.add('hidden');$('athenaPreviewFrame').srcdoc='';state.files=[];renderAttachments();}
    artifactView('preview');
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-current',b.dataset.mode===mode?'page':'false');});
    if(mode==='image'||mode==='video'){
      $('videoTypeLabel').classList.toggle('hidden',mode!=='video'); $('imageStyleLabel').classList.toggle('hidden',mode!=='image');
      $('mediaUploadControls').classList.toggle('hidden',mode!=='image');
      $('modeDesc').textContent=mode==='image'?'Create and refine images. Clear results, no placeholder substitutes.':'Generate motion when available, or choose a storyboard explicitly.';
      $('mediaHint').textContent=mode==='image'?'Choose a format and describe your image. Add a reference image to guide an edit.':'True video generation requires a verified free provider. Storyboards are a separate text tool.';
      mediaStatus(mode==='image'?'Describe the image you have in mind.':'Choose video generation or a storyboard.');
    }
  }

  async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied','success');}catch{toast('Clipboard unavailable. Select and copy the text manually.','error');}}

  const textExt=new Set('txt md markdown csv tsv json jsonl xml yaml yml html htm css js jsx ts tsx py java c h cpp hpp cs go rs php rb sh bash ps1 sql r swift kt ini cfg toml log tex srt vtt eml ics svg ipynb'.split(' '));
  const mediaMime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
  const archiveExt=new Set(['docx','pptx','xlsx','odt','ods','odp','epub','zip']);
  const MAX_BYTES=3*1024*1024;

  function extractArchive(buffer, ext){
    if(!window.fflate)throw Error('Document reader could not load. Refresh and try again.');
    let total=0,count=0;
    const files=fflate.unzipSync(new Uint8Array(buffer),{filter:entry=>{
      if(++count>300)throw Error('This archive contains too many entries. Upload a smaller selection.');
      if(entry.originalSize>4*1024*1024 || (total+=entry.originalSize)>8*1024*1024)throw Error('The expanded archive is too large. Upload individual files.');
      return !entry.name.endsWith('/') && (/\.(xml|html|xhtml|txt|md|csv|json|js|ts|py|css|java|sql)$/i.test(entry.name));
    }});
    const parser=new DOMParser();const sections=[];
    let shared=[];
    if(files['xl/sharedStrings.xml']){const xml=parser.parseFromString(fflate.strFromU8(files['xl/sharedStrings.xml']),'text/xml');shared=[...xml.getElementsByTagName('si')].map(n=>n.textContent);}
    for(const [name,bytes] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))){
      let raw=fflate.strFromU8(bytes),content='';
      if(ext==='docx' && !/^word\/(document|header\d+|footer\d+)\.xml$/.test(name))continue;
      if(ext==='pptx' && !/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name))continue;
      if(ext==='xlsx' && !/^xl\/worksheets\/sheet\d+\.xml$/.test(name))continue;
      if(['odt','ods','odp'].includes(ext)&&name!=='content.xml')continue;
      if(ext==='epub'&&!/\.(xhtml|html)$/i.test(name))continue;
      if(/\.(xml|xhtml|html)$/i.test(name)){
        const xml=parser.parseFromString(raw,'text/xml');
        if(ext==='xlsx')content=[...xml.getElementsByTagName('row')].map(row=>[...row.getElementsByTagName('c')].map(cell=>{const value=cell.getElementsByTagName('v')[0]?.textContent||cell.textContent;return cell.getAttribute('t')==='s'?shared[Number(value)]||'':value;}).join('\t')).join('\n');
        else if(['docx','pptx'].includes(ext))content=[...xml.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')).join('\n');
        else content=xml.documentElement?.textContent||'';
      }else content=raw;
      if(content.trim())sections.push('File: '+name+'\n'+content);
      if(sections.join('\n').length>80000)throw Error('The extracted text exceeds 80,000 characters. Split the document.');
    }
    if(!sections.length)throw Error('No readable text was found in this file. Try PDF or a text export.');
    return sections.join('\n\n');
  }

  async function addFiles(list, imageOnly=false){
    if(state.reading)return;state.reading=true;
    try{
      for(const file of list){
        if(state.files.length>=5)throw Error('You can attach up to five files.');
        if(file.size>MAX_BYTES || state.files.reduce((n,f)=>n+f.size,0)+file.size>MAX_BYTES)throw Error('Files must total 3 MB or less per message. Trim large media clips or split the files.');
        const ext=file.name.split('.').pop().toLowerCase();
        if(imageOnly&&!['png','jpg','jpeg','webp'].includes(ext))throw Error('Use a PNG, JPG, or WebP reference image.');
        const record={name:file.name,size:file.size,id:crypto.randomUUID()};
        if(textExt.has(ext)){record.text=await file.text();if(record.text.length>80000)throw Error('Text files must contain 80,000 characters or fewer.');}
        else if(archiveExt.has(ext))record.text=extractArchive(await file.arrayBuffer(),ext);
        else if(mediaMime[ext]){
          record.mimeType=mediaMime[ext];
          record.data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});
        }else throw Error(`.${ext} files cannot be analysed yet. Try PDF, DOCX, XLSX, PPTX, text, images, audio, video, or ZIP.`);
        state.files.push(record);renderAttachments();
      }
    }catch(error){toast(error.message,'error',6500);}finally{state.reading=false;renderAttachments();}
  }

  function renderAttachments(){
    for(const id of ['chatAttachments','mediaAttachments']){
      const list=$(id);if(!list)continue;list.innerHTML='';
      state.files.forEach(file=>{
        const item=document.createElement('div');item.className='attachment';
        if(['image/png','image/jpeg','image/webp'].includes(file.mimeType)){const img=document.createElement('img');img.alt='';img.src=`data:${file.mimeType};base64,${file.data}`;item.append(img);}
        const label=document.createElement('span');label.className='attachment-name';label.textContent=file.name;label.title=file.name;
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove '+file.name);remove.onclick=()=>{state.files=state.files.filter(f=>f.id!==file.id);renderAttachments();};
        item.append(label,remove);list.append(item);
      });
    }
  }

  function uploads(){
    const controls=document.createElement('div');controls.className='upload-controls';
    controls.innerHTML=`<button type="button" id="attachFiles" class="btn ghost">${icon('paperclip')} Attach files</button><span class="upload-hint">Up to 5 files · 3 MB total · drag & drop</span><input id="fileInput" type="file" multiple hidden><div id="chatAttachments" class="attachments" aria-live="polite"></div>`;
    $('promptInput').closest('.input-row').before(controls);
    $('attachFiles').onclick=()=>$('fileInput').click();
    $('fileInput').onchange=async e=>{await addFiles([...e.target.files]);e.target.value='';};
    const chat=$('chatLayout');
    chat.ondragover=e=>{e.preventDefault();chat.classList.add('drop-target');};chat.ondragleave=()=>chat.classList.remove('drop-target');
    chat.ondrop=e=>{e.preventDefault();chat.classList.remove('drop-target');addFiles([...e.dataTransfer.files]);};
    const cancel=document.createElement('button');cancel.type='button';cancel.id='cancelChat';cancel.className='btn ghost hidden';cancel.textContent='Stop';cancel.onclick=()=>state.controller?.abort();$('sendBtn').after(cancel);
  }

  async function send(){
    if(isSending || state.reading)return;
    const user=getCurrentUser();if(!user){toast('Please sign in first.','error');return;}
    const text=$('promptInput').value.trim();if(!text&&!state.files.length)return;
    const mode=currentMode, previous=chatHistory.slice(), files=state.files.map(({name,text,mimeType,data})=>({name,text,mimeType,data}));
    const prompt=text || 'Summarise the attached files.';
    state.response=null;
    isSending=true;$('sendBtn').disabled=true;$('cancelChat').classList.remove('hidden');
    if(!activeChat.id)newChatSession(mode);
    addMessage(prompt+(files.length?'\n\nAttached: '+files.map(f=>f.name).join(', '):''),'user',false);
    const think=addThinking('Working on your request…');state.controller=new AbortController();
    try{
      let results=[];
      if(mode==='research'&&$('useWebSearch').checked)results=await doWebSearch(prompt);
      const message=(mode==='code'?'[Language: '+$('codeLanguage').value+']\n':'')+prompt;
      const reply=await callBackend(mode,message,user.plan,previous,results,files,state.controller.signal);
      if(currentMode!==mode)return;
      addMessage(reply,'ai',true);
      state.response=null;
      if(mode==='docs')lastDocsContent=reply;
      $('promptInput').value='';state.files=[];renderAttachments();
      saveActiveChat();renderChatHistory();
    }catch(error){
      if(currentMode===mode){addMessage(error.name==='AbortError'?'Generation stopped. Your prompt and attachments are ready to retry.':error.message,'ai',false);}
    }finally{think.remove();state.controller=null;isSending=false;$('sendBtn').disabled=false;$('cancelChat').classList.add('hidden');}
  }

  async function capabilities(){
    const select=$('modelSelect');
    select.innerHTML='<option value="auto">Auto · best available</option><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter · free</option>';
    select.title='Preferred provider. With Auto backup enabled, another compatible connection can take over.';
    const backup=document.createElement('label');backup.className='backup-toggle';backup.innerHTML='<input type="checkbox" id="autoBackup"> Auto backup';select.after(backup);
    $('autoBackup').checked=localStorage.getItem('athena_backups')!=='off';$('autoBackup').onchange=()=>localStorage.setItem('athena_backups',$('autoBackup').checked?'on':'off');
    const status=document.createElement('div');status.id='providerNotice';status.className='provider-notice hidden';status.setAttribute('role','status');$('mobileWorkspaceTabs').before(status);
    select.value=['auto','gemini','groq','openrouter'].includes(localStorage.getItem('athena_provider'))?localStorage.getItem('athena_provider'):'auto';
    select.onchange=()=>localStorage.setItem('athena_provider',select.value);
    try{
      const response=await fetch(BACKEND_HEALTH,{signal:AbortSignal.timeout(8000),cache:'no-store'});
      if(!response.ok)return;const data=await response.json();state.capabilities=data;
      for(const option of select.options){if(option.value==='auto')continue;const available=data.chatProviders?.[option.value]?.configured;if(available===false){option.disabled=true;option.textContent+=' · not connected';}}
      if(select.selectedOptions[0]?.disabled){select.value='auto';localStorage.setItem('athena_provider','auto');}
    }catch{/* The connection button reports availability separately. */}
  }

  function mediaStatus(message,error=false){$('mediaPreview').innerHTML='';const box=document.createElement('div');box.className='media-state'+(error?' error':'');box.setAttribute('role',error?'alert':'status');box.textContent=message;$('mediaPreview').append(box);}

  function media(){
    const controls=document.createElement('div');controls.className='media-controls';
    controls.innerHTML='<label id="imageStyleLabel">Style<select id="imageStyle"><option value="">As described</option><option>Photographic</option><option>Illustration</option><option>Anime</option><option>Product photography</option><option>Watercolour</option></select></label><label>Format<select id="mediaAspect"><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option><option value="9:16">Portrait · 9:16</option></select></label><label id="videoTypeLabel" class="hidden">Create<select id="videoType"><option value="motion">AI video · moving scenes</option><option value="storyboard">Storyboard · text only</option></select></label>';
    $('mediaPromptInput').closest('.input-row').before(controls);
    const attach=document.createElement('div');attach.id='mediaUploadControls';attach.className='upload-controls';
    attach.innerHTML='<button id="attachReference" class="btn ghost" type="button">Add reference image</button><input type="file" id="referenceInput" accept="image/png,image/jpeg,image/webp" hidden><div id="mediaAttachments" class="attachments" aria-live="polite"></div>';
    controls.after(attach);$('attachReference').onclick=()=>$('referenceInput').click();$('referenceInput').onchange=async e=>{await addFiles([...e.target.files],true);e.target.value='';};
    const stop=document.createElement('button');stop.id='cancelMedia';stop.type='button';stop.className='btn ghost hidden';stop.textContent='Stop';stop.onclick=()=>state.mediaController?.abort();$('mediaSendBtn').after(stop);
    $('mediaSendBtn').addEventListener('click',generateMedia);
    $('mediaPromptInput').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();generateMedia();}});
  }

  async function imageRequest(prompt, signal){
    const refs=state.files.filter(f=>f.data).map(({name,mimeType,data})=>({name,mimeType,data}));
    if(refs.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.mimeType)))throw Error('Use PNG, JPG, or WebP reference images for image generation.');
    const response=await fetch(BACKEND_IMAGE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,aspectRatio:$('mediaAspect').value,style:$('imageStyle').value,attachments:refs}),signal:signal || AbortSignal.timeout(55000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error || 'Image generation failed.');
    if(!/^data:image\/(png|jpeg|webp);base64,/.test(data.imageUrl || ''))throw Error('The provider returned no usable image.');
    const img=new Image();img.src=data.imageUrl;await img.decode();
    return {url:data.imageUrl,provider:data.provider || 'Image provider',model:data.model};
  }

  async function generateMedia(){
    if(state.mediaController||state.reading)return;
    const user=getCurrentUser();if(!user){toast('Please sign in first.','error');return;}
    const prompt=$('mediaPromptInput').value.trim();if(!prompt)return;
    const mode=currentMode;state.mediaController=new AbortController();const signal=state.mediaController.signal;
    const timer=setTimeout(()=>state.mediaController?.abort(),60000);
    $('mediaSendBtn').disabled=true;$('cancelMedia').classList.remove('hidden');
    mediaStatus('Creating your '+(mode==='image'?'image':'result')+'…');const progress=document.createElement('progress');progress.className='media-progress';progress.setAttribute('aria-label','Generation in progress');$('mediaPreview').append(progress);
    try{
      if(mode==='image'){
        const result=await imageRequest(prompt,signal);if(currentMode!==mode)return;
        $('mediaPreview').innerHTML='';const img=document.createElement('img');img.src=result.url;img.alt=prompt;$('mediaPreview').append(img);
        const actions=document.createElement('div');actions.className='media-result-actions';
        const download=document.createElement('button');download.className='btn primary';download.textContent='Download image';download.onclick=()=>downloadResource(result.url,'athena-image.'+(result.url.startsWith('data:image/jpeg')?'jpg':result.url.startsWith('data:image/webp')?'webp':'png'));
        const variation=document.createElement('button');variation.className='btn ghost';variation.textContent='Create another';variation.onclick=generateMedia;actions.append(download,variation);$('mediaPreview').append(actions);
        const label=document.createElement('p');label.className='hint';label.textContent='Generated with '+result.provider+(result.model?' · '+result.model:'');$('mediaPreview').append(label);
      }else if($('videoType').value==='storyboard'){
        const reply=await callBackend('video',prompt,user.plan,[],[],[],signal);if(currentMode!==mode)return;
        $('mediaPreview').innerHTML='<h3>Storyboard · text only</h3><div class="md-content">'+renderMarkdown(reply)+'</div>';
        const download=document.createElement('button');download.className='btn ghost';download.textContent='Download storyboard';download.onclick=()=>downloadTextFile('athena-storyboard.txt',reply);$('mediaPreview').append(download);
      }else{
        const response=await fetch(BACKEND_VIDEO,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,kind:'motion',aspectRatio:$('mediaAspect').value}),signal});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw Error(data.error || 'Video generation is unavailable.');
        throw Error('No verified motion-video result was returned. No slideshow has been substituted.');
      }
    }catch(error){if(currentMode===mode){mediaStatus(error.name==='AbortError'?'Generation stopped or timed out. Your prompt is ready to retry.':error.message,true);const retry=document.createElement('button');retry.className='btn ghost';retry.textContent='Retry';retry.onclick=generateMedia;$('mediaPreview').append(retry);}}
    finally{clearTimeout(timer);state.mediaController=null;$('mediaSendBtn').disabled=false;$('cancelMedia').classList.add('hidden');}
  }

  function recordResponse(data,mode){
    state.response={truncated:Boolean(data.truncated)};
    const notice=$('providerNotice');
    const names={gemini:'Gemini',groq:'Groq',openrouter:'OpenRouter'};
    notice.textContent=(data.routing?.usedBackup?'Backup connection used · ':'Answered by ')+(names[data.provider]||'Athena')+(mode==='code'&&data.truncated?' · incomplete output':'');
    notice.classList.remove('hidden');
  }
  window.Athena={renderMarkdown,presentCode,modeChanged,send,imageRequest,extractCode,addFiles,recordResponse,state};
  buildWorkspace();uploads();media();capabilities();
  const screenObserver=new MutationObserver(()=>document.body.classList.toggle('app-open',!$('screen-app').classList.contains('hidden')));screenObserver.observe($('screen-app'),{attributes:true,attributeFilter:['class']});
  document.body.classList.toggle('app-open',!$('screen-app').classList.contains('hidden'));
  $('heroStart').onclick=()=>getCurrentUser()?showScreen('app'):showScreen('signup');$('heroLogin').onclick=()=>showScreen('login');
  modeConfig.humanizer.title='Humaniser';modeConfig.chat.desc='A place to think, ask, and create.';
  document.addEventListener('athena:mode',e=>modeChanged(e.detail.mode,e.detail.reset));
  modeChanged(currentMode);
})();
