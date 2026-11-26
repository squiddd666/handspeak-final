const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({permissions:['camera'],viewport:{width:1440,height:1000}});const page=await context.newPage();
 const errors=[],bad=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://localhost:8001'))bad.push([r.status(),r.url()]);});
 async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message.slice(0,600)});}}
 await test('Initial page and model loading',async()=>{await page.goto('http://localhost:8001/',{waitUntil:'networkidle'});await page.waitForTimeout(2000);if(errors.length)throw Error(errors.join(';'));});
 await test('Learn navigation and six reference words',async()=>{await page.getByRole('link',{name:'Learn',exact:true}).click();await page.locator('#sign-examples').waitFor({state:'visible'});const words=await page.locator('[data-sign-example]').allTextContents();if(words.length!==6)throw Error(JSON.stringify(words));});
 await test('Reference selection',async()=>{for(const word of ['hello','please','finish','water','food','hungry']){await page.locator(`[data-sign-example="${word}"]`).click();if(!(await page.locator('#signExampleVideo').getAttribute('src')).includes(word))throw Error(word);}});
 await test('Teach A Sign tabs',async()=>{await page.getByRole('link',{name:'Teach A Sign',exact:true}).click();await page.locator('#teachTab-words').click();await page.locator('#motionLabel').waitFor({state:'visible'});await page.locator('#teachTab-signs').click();if(await page.locator('.teach-tile').count()<34)throw Error('Missing tiles');});
 await test('Shortcut bank',async()=>{const result=await page.evaluate(async()=>{const {expandLetterShortcut:e}=await import('/letter-word-bank.js');const bank=await(await fetch('/letter-word-bank.json')).json();return Object.entries(bank).filter(([key,value])=>e(key,bank)!==value);});if(result.length)throw Error(JSON.stringify(result));});
 await test('Camera starts with synthetic test stream',async()=>{await page.locator('#teachStart').click();await page.waitForFunction(()=>Boolean(document.querySelector('#webcam').srcObject),{timeout:30000});await page.locator('#teachStop').click();});
 await test('Mobile layout',async()=>{await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'e2e-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Horizontal overflow');});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'e2e-desktop.png',fullPage:true});
 await test('Shared word endpoint',async()=>{const r=await context.request.get('http://localhost:8001/api/shared-words');if(!r.ok()||!Array.isArray((await r.json()).samples))throw Error('Invalid shared response');});
 await test('Removed account routes',async()=>{for(const route of ['auth/me','sessions','metrics']){const r=await context.request.get('http://localhost:8001/api/'+route);if(r.status()!==404)throw Error(route);}});
 await test('Second browser sees shared words',async()=>{const c=await browser.newContext();try{const r=await c.request.get('http://localhost:8001/api/shared-words');if(!r.ok())throw Error('Shared storage unavailable');}finally{await c.close();}});
 fs.writeFileSync('e2e-report.json',JSON.stringify({results,errors,bad},null,2));console.log(JSON.stringify({results,errors,bad},null,2));await browser.close();
})();
