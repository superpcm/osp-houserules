const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BR19_PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const root = process.cwd();
 const css = fs.readFileSync(path.join(root, 'dist/ose.css'),'utf8');
 const source = fs.readFileSync(path.join(root,'src/module/actor/sheets/combat-value-sizing.js'),'utf8').replace(/^export /gm,'');
 const template = fs.readFileSync(path.join(root,'templates/actors/character-sheet.html'),'utf8');
 const start=template.indexOf('<div class="combat-hpac-image">');
 const end=template.indexOf('</div>',template.indexOf('>uAC</label>',start))+6;
 const block=template.slice(start,end)+'</div></div>';
 const cases=[{width:960,values:[8,88,40,80,120,16,12]},{width:720,values:[-12,999,0,5,120,10,9]},{width:540,values:[-1,120,40,80,120,16,12]}];
 const rows=cases.map((c,i)=>{let n=0;return `<section><h2>${c.width}px combat row · representative test values</h2><form id="row${i}" class="osp sheet actor character" style="width:${c.width}px"><div class="tab" data-tab="combat"><section class="combat-generated-panel">${block.replace(/\{\{.*?\}\}/g,()=>String(c.values[n++]))}</section></div></form></section>`}).join('');
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1080,height:760},deviceScaleFactor:1});
 await page.route('**/*',route=>route.abort());
 await page.setContent(`<html><head><style>${css}</style><style>body{margin:24px;background:#eee6d6;color:#2c1810}h1{font:22px Georgia}h2{font:16px Georgia;margin:24px 0 12px}section{margin-bottom:28px}form.osp.sheet.actor.character{margin:0;padding:0;min-width:0}p{font:14px Georgia}form.osp.sheet.actor.character .tab[data-tab="combat"]{width:100%!important;min-width:0!important;height:auto!important;margin:0!important;overflow:visible!important}form.osp.sheet.actor.character{background:transparent!important}form.osp.sheet.actor.character .combat-generated-panel{margin:0!important}</style></head><body><h1>BR-19 responsive combat numerals</h1><p>Production combat markup, stylesheet and sizing helper. Standalone browser fixture; local font availability applies. Fixture overrides only outer sheet dimensions to exercise component widths.</p>${rows}</body></html>`);
 await page.addScriptTag({content:source+'\nwindow.br19Disposers=[...document.querySelectorAll("form")].map(activateCombatValueSizing);'});
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const evidence=await page.evaluate(()=>[...document.querySelectorAll('.combat-stat')].map(frame=>{
 const value=frame.querySelector('.cs-combat-input,.cs-unarmored-box'); const s=getComputedStyle(value), r=frame.getBoundingClientRect(); const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;const text='value'in value?value.value:value.textContent.trim(),m=ctx.measureText(text);return {text,frameWidth:r.width,frameHeight:r.height,font:s.fontFamily,fontSize:s.fontSize,variable:value.style.getPropertyValue('--ej-combat-value-font-size'),inkWidth:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,inkHeight:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};}));
 for(const r of evidence){if(!r.variable || r.inkWidth>r.frameWidth*.70+2 || r.inkHeight>r.frameHeight*.38+2)throw Error('Invalid sizing '+JSON.stringify(r));}
 const out=path.join(root,'docs/qa');fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,'BR-19-responsive-numerals.png'),fullPage:true});
 fs.writeFileSync(path.join(out,'BR-19-responsive-numerals.json'),JSON.stringify({fixture:'Production combat markup, built stylesheet and sizing helper; isolated Chrome, not live Foundry',rows:evidence},null,2)+'\n');
 console.log(JSON.stringify({cells:evidence.length,screenshot:path.join(out,'BR-19-responsive-numerals.png'),allWithinBounds:true}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
