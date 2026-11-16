# Screenshot provenance and reproduction

These images show the plugin's production settings UI with **synthetic cameras**.
They illustrate controls; they do not establish real-account, Home hub or iCloud
acceptance.

Captured on 16 November 2026 from main source revision
`ab091a4bb79a79adfad6687c18f2bc64ad541395` (`1.1.0-rc.0`). The source was
compiled in a disposable build snapshot using its locked dependencies and no
installation lifecycle scripts. No production source or provider data was changed.

The 2.0 prerelease guide reuses these illustrations of unchanged controls. They
do not show external FFmpeg installation or qualify the changed media backend.

## Source and scope

- [Synthetic preview harness](../../../scripts/preview-plugin-ui.mjs) and its
  compiled settings validator.
- Actual [UI templates, styles and scripts](../../../src/homebridge-ui/public/).
- Public Puppeteer 25.16.0 and its installed Chromium; Node.js 22.23.4 on macOS arm64.
- Viewport 1000 × 1500 CSS pixels, device scale 1.5; the source harness's 800 CSS-pixel
  content area produces 1200-pixel-wide images.
- Capture of `.blink-ui`, excluding synthetic host controls. The camera picture
  expands the first camera disclosure and ends after its first system group.
- No image editing, replacement styles, real credentials or provider calls.
  Keyboard focus is cleared after navigation. Timestamps are synthetic.
- Browser requests outside the loopback origin and data URLs are blocked.

| Image | Actual UI section | Illustrated controls |
| --- | --- | --- |
| [Camera selection](images/cameras-in-home.png) | Cameras in Home | Camera inclusion, name, Motion Detected, recording, quality and Early Notification |
| [Live video and audio](images/live-viewing-sound.png) | Live viewing & sound | Viewing, picture quality and listening audio |
| [Recording setup](images/recording-setup.png) | HomeKit recording | Per-camera selection, prerequisites, Early Notification and timing disclosure |

## Reproduce

From a checkout at the cited revision, use its supported Node.js runtime:

```sh
npm ci --ignore-scripts
npm run build
node scripts/preview-plugin-ui.mjs --check
node scripts/preview-plugin-ui.mjs 8891
```

Use an existing local Puppeteer installation with its matching Chromium. It is
an optional documentation capture tool. Set `BLINK_DOCS_PUPPETEER` to its public
ES-module entry point if it is outside the project module search path.
In another terminal, save this code as a temporary `capture-blink-docs.mjs` at the
repository root and run `node capture-blink-docs.mjs`:

```js
const { default: puppeteer } = await import(process.env.BLINK_DOCS_PUPPETEER || 'puppeteer');
import fs from 'node:fs/promises';
const out='output/articles/set-up-blink-cameras-in-apple-home/images';
const browser=await puppeteer.launch({headless:true});
try {
 const page=await browser.newPage();await page.setViewport({width:1000,height:1500,deviceScaleFactor:1.5});
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('http://127.0.0.1:8891/')||r.url().startsWith('data:')?r.continue():r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,label] of [['cameras-in-home','Cameras in Home'],['live-viewing-sound','Live viewing & sound'],['recording-setup','HomeKit recording']]){
  await page.goto('http://127.0.0.1:8891/',{waitUntil:'networkidle0'});
  await page.waitForSelector('#settingsNavigation button');
  await page.evaluate(label=>[...document.querySelectorAll('#settingsNavigation button')].find(b=>b.textContent===label).click(),label);
  await page.waitForFunction(label=>document.querySelector('#sectionTitle')?.textContent===label,{},label);
  if(name==='cameras-in-home')await page.click('.blink-camera summary');
  await page.waitForNetworkIdle();
  await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
  const ui=await page.$('.blink-ui');
  if(name==='cameras-in-home'){
   const clip=await page.evaluate(()=>{const u=document.querySelector('.blink-ui').getBoundingClientRect(),card=document.querySelector('.blink-system').getBoundingClientRect();return{x:u.x+scrollX,y:u.y+scrollY,width:u.width,height:card.bottom-u.top+12};});
   await page.screenshot({path:out+'/'+name+'.png',clip,captureBeyondViewport:true});
  }else await ui.screenshot({path:out+'/'+name+'.png'});
  console.log('Captured '+name);
 }
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Current main UI images captured with external requests blocked.');
} finally {await browser.close();}
```

Review all three images after capture. Stop the preview server and discard the
temporary capture script when done. Preserve this note's distinction between
synthetic UI illustrations and physical recording/playback evidence.
