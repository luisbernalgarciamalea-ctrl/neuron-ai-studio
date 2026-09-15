/* Local browser regression checks. Every external API is simulated. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),http=require('http');
const {zipSync,strToU8}=require('../vendor/fflate.js');
const root=path.resolve(__dirname,'..');
const shots=process.env.ATHENA_SCREENSHOTS;
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(bytes);});
});
const code='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f3ede4;color:#302b25;font-family:Georgia;padding:60px 40px}small{letter-spacing:3px}h1{font-size:clamp(30px,6vw,52px);line-height:1.05;font-weight:400}button{background:#53634c;color:white;padding:14px 24px;border:0;border-radius:25px}article{background:#dfd2c1;border-radius:90px 90px 12px 12px;height:180px;margin-top:40px;display:grid;place-items:center;font-size:70px}</style></head><body><small>EARTH & FORM</small><h1>Something beautiful.<br>Made by you.</h1><p>A quiet space to discover the art of working with clay.</p><button onclick="this.textContent=\'You are on the list\'">Explore workshops</button><article>◡</article></body></html>';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZKsAAAAASUVORK5CYII=','base64');
const fixtures={
 'notes.docx':{'word/document.xml':'<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Document evidence</w:t></w:r></w:p></w:body></w:document>'},
 'slides.pptx':{'ppt/slides/slide1.xml':'<p:sld xmlns:p="urn:slides" xmlns:a="urn:drawing"><a:p><a:r><a:t>Slide evidence</a:t></a:r></a:p></p:sld>'},
 'table.xlsx':{'xl/sharedStrings.xml':'<sst><si><t>Revenue</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheetData></worksheet>'},
 'book.epub':{'chapter.xhtml':'<html><body><p>Book evidence</p></body></html>'},
 'project.zip':{'main.py':'print("Project evidence")'}
};
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],requests=[];let failChat=false,delayChat=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=req.url();if(url.startsWith(base))return route.continue();
   if(!url.includes('neuron-backend-v2.vercel.app'))return route.abort();
   const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.endsWith('/api/health'))return route.fulfill({headers,json:{ok:true,chatProviders:{gemini:{configured:true},groq:{configured:true},openrouter:{configured:true}},providers:{image:false,video:false}}});
   if(url.endsWith('/api/auth'))return route.fulfill({headers,json:{success:true,user:{name:'Preview user',email:'preview@example.invalid',plan:'Free'}}});
   if(url.includes('/api/search'))return route.fulfill({status:503,headers,json:{error:'Web search is not connected.',results:[]}});
   if(url.endsWith('/api/chat')){
    const payload=req.postDataJSON();requests.push(payload);if(delayChat)await new Promise(resolve=>setTimeout(resolve,600));
    if(failChat)return route.fulfill({status:429,headers,json:{error:'Free quota reached. Please wait.'}});
    const reply=payload.mode==='code'?'Here is your page.\n```html\n'+code+'\n```':payload.mode==='video'?'SCENE 1 — 5s\nVisual: An owl flying.':payload.mode==='presentation'?'## SLIDE 1: An idea\nKey Content: Build something useful.':'Your document is ready.\n\n## A clear beginning\nThis is a simulated answer for the local test.';
    return route.fulfill({headers,json:{reply,provider:'groq',model:'test-model'}});
   }
   if(url.endsWith('/api/image'))return route.fulfill({status:503,headers,json:{error:'Free image access needs to be verified.'}});
   if(url.endsWith('/api/video'))return route.fulfill({status:503,headers,json:{error:'A free motion-video provider is not connected.'}});
   return route.abort();
  });
  await page.goto(base);await page.waitForFunction(()=>Boolean(window.Athena));
  assert.equal(await page.title(),'Athena AI');assert.equal(await page.locator('.mode-btn[data-mode] svg').count(),15);
  if(shots)await page.screenshot({path:path.join(shots,'athena-home.png'),fullPage:true});
  await page.locator('#heroStart').click();await page.locator('#signupForm input[name="name"]').fill('Preview user');await page.locator('#signupForm input[name="email"]').fill('preview@example.invalid');await page.locator('#signupForm input[name="password"]').fill('test-only-password');await page.locator('#signupForm button[type="submit"]').click();
  await page.waitForFunction(()=>!document.getElementById('screen-app').classList.contains('hidden'));
  // Upload actual archive structures, not fabricated pre-extracted results.
  for(const [name,entries] of Object.entries(fixtures)){
    const buffer=Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([key,value])=>[key,strToU8(value)]))));
    await page.locator('#fileInput').setInputFiles({name,mimeType:'application/octet-stream',buffer});
    await page.waitForFunction(expected=>Athena.state.files.some(f=>f.name===expected),name);
  }
  const extracted=await page.evaluate(()=>Athena.state.files.map(f=>f.text).join('\n'));for(const expected of ['Document evidence','Slide evidence','Revenue','42','Book evidence','Project evidence'])assert(extracted.includes(expected));
  await page.locator('#promptInput').fill('Summarise these files');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!isSending);
  assert.equal(requests.at(-1).payload.attachments.length,5);assert.equal(requests.at(-1).payload.history.filter(m=>m.content.startsWith('Summarise these files')).length,0);
  assert.equal(await page.locator('#chatAttachments .attachment').count(),0);
  // Provider selection travels to the backend.
  await page.locator('#modelSelect').selectOption('openrouter');await page.locator('#promptInput').fill('A second question');await page.locator('#promptInput').press('Control+Enter');await page.waitForFunction(()=>!isSending);assert.equal(requests.at(-1).payload.provider,'openrouter');
  await page.locator('[data-mode="code"]').click();await page.locator('#promptInput').fill('Build a landing page for a ceramics workshop.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!isSending);
  const frame=page.frameLocator('#athenaPreviewFrame');await frame.getByRole('button',{name:'Explore workshops'}).click();await frame.getByRole('button',{name:'You are on the list'}).waitFor();
  assert.equal(await page.locator('#messages .code-artifact-card').count(),1);assert.equal(await page.locator('#messages pre').count(),0);
  const previewHandle=await page.locator('#athenaPreviewFrame').elementHandle();const previewFrame=await previewHandle.contentFrame();
  assert(await previewFrame.evaluate(()=>{try{parent.localStorage.getItem('neuron_session_v2');return false;}catch{return true;}}));
  await page.locator('#artifactCode').click();assert((await page.locator('#artifactSource').innerText()).includes('EARTH & FORM'));await page.locator('#artifactPreview').click();
  const divider=page.locator('#workspaceDivider');await divider.focus();await page.keyboard.press('ArrowRight');assert((await page.locator('.workspace').getAttribute('style')).includes('45%'));
  const downloadPromise=page.waitForEvent('download');await page.locator('#artifactDownload').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'index.html');
  if(shots)await page.screenshot({path:path.join(shots,'athena-code-desktop.png'),fullPage:true});
  // Reloaded code conversations retain their mode and compact file cards.
  const id=await page.evaluate(()=>activeChat.id);await page.locator('[data-mode="chat"]').click();await page.evaluate(id=>loadChat(id),id);assert.equal(await page.evaluate(()=>currentMode),'code');assert.equal(await page.locator('#messages .code-artifact-card').count(),1);
  // Untrusted Markdown cannot escape into the page or leave active handlers.
  const safe=await page.evaluate(()=>Athena.renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>[link](javascript:alert(1))'));assert(!/onerror|<script|javascript:/.test(safe));
  await page.locator('[data-mode="docs"]').click();await page.locator('#fileInput').setInputFiles({name:'large.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(3*1024*1024+1)});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>Athena.state.files.length),0);
  await page.locator('#fileInput').setInputFiles({name:'program.exe',mimeType:'application/octet-stream',buffer:Buffer.from('untrusted program')});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>Athena.state.files.length),0);
  await page.locator('#fileInput').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>Athena.state.files.length===1);await page.getByRole('button',{name:'Remove photo.png',exact:true}).click();assert.equal(await page.evaluate(()=>Athena.state.files.length),0);
  await page.locator('#promptInput').fill('Write a short document');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!isSending);const docDownload=page.waitForEvent('download');await page.locator('#downloadDocsDocxBtn').click();assert.equal((await docDownload).suggestedFilename(),'athena-document.docx');
  // Failures keep the prompt available and do not claim success.
  failChat=true;await page.locator('#promptInput').fill('Retry me');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!isSending);assert.equal(await page.locator('#promptInput').inputValue(),'Retry me');assert((await page.locator('#messages').innerText()).includes('Free quota reached'));failChat=false;
  delayChat=true;await page.locator('#sendBtn').click();await page.locator('#cancelChat').click();await page.waitForFunction(()=>!isSending);assert((await page.locator('#messages').innerText()).includes('Generation stopped'));delayChat=false;
  await page.locator('[data-mode="research"]').click();await page.locator('#useWebSearch').check();const before=requests.length;await page.locator('#promptInput').fill('Find current research');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!isSending);assert.equal(requests.length,before);assert((await page.locator('#messages').innerText()).includes('Web search is not connected'));
  await page.locator('[data-mode="image"]').click();await page.locator('#mediaPromptInput').fill('An owl');await page.locator('#mediaSendBtn').click();await page.waitForFunction(()=>!Athena.state.mediaController);assert.equal(await page.locator('#mediaPreview img').count(),0);assert((await page.locator('#mediaPreview').innerText()).includes('Free image access'));
  await page.locator('[data-mode="video"]').click();await page.locator('#mediaSendBtn').click();await page.waitForFunction(()=>!Athena.state.mediaController);assert.equal(await page.locator('#mediaPreview video').count(),0);assert((await page.locator('#mediaPreview').innerText()).includes('free motion-video'));
  await page.locator('#videoType').selectOption('storyboard');await page.locator('#mediaSendBtn').click();await page.waitForFunction(()=>!Athena.state.mediaController);assert((await page.locator('#mediaPreview').innerText()).includes('Storyboard · text only'));
  // Mobile tools and preview reflow without horizontal overflow.
  await page.evaluate(id=>loadChat(id),id);await page.setViewportSize({width:390,height:844});await page.locator('#mobileWorkspaceTabs [data-view="artifact"]').click();
  await page.frameLocator('#athenaPreviewFrame').getByRole('button',{name:'Explore workshops'}).click();
  await page.frameLocator('#athenaPreviewFrame').getByRole('button',{name:'You are on the list'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  console.log('Computed interface font:',await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily));
  await page.locator('#toastCt').evaluate(el=>el.replaceChildren());
  if(shots)await page.screenshot({path:path.join(shots,'athena-code-mobile.png'),fullPage:true});
  await page.locator('#sidebarToggle').click();await page.locator('[data-mode="humanizer"]').click();assert.equal(await page.evaluate(()=>currentMode),'humanizer');assert.equal(await page.locator('.sidebar.is-open').count(),0);
  // Chapter errors stay out of saved prose; retries retain continuation context.
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-mode="author"]').click();
  await page.locator('#bookTitleInput').fill('An owl at midnight');
  failChat=true;await page.locator('#bookStartBtn').click();await page.waitForFunction(()=>!bookBusy);
  assert.equal(await page.evaluate(()=>bookChunks.length),0);assert.equal(await page.locator('#bookBubbles .writing-bubble').count(),0);
  failChat=false;await page.locator('#bookContinueBtn').click();await page.waitForFunction(()=>!bookBusy);
  assert.equal(await page.evaluate(()=>bookChunks.length),1);
  await page.locator('#bookContinueBtn').click();await page.waitForFunction(()=>!bookBusy);
  assert.equal(await page.evaluate(()=>bookChunks.length),2);assert(requests.at(-1).payload.history.some(m=>m.content.includes('Chapter 1, part 1')));
  assert.deepEqual(errors,[]);
  console.log('PASS: real signup UI with simulated auth; 15 icons; five archive formats; attachments and limits; provider selection; single-send; interactive isolated preview; code tabs, resize and downloads; restored code chats; sanitised Markdown; DOCX download; cancel/retry; research errors; no placeholder images or video; explicit storyboards; mobile navigation.');
 }finally{await browser.close();server.close();}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
