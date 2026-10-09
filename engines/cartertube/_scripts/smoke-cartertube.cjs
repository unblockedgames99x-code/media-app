// Exercise the built desktop app with an isolated copy of the user's library.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const net = require('node:net')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'qa')
fs.mkdirSync(output, { recursive: true })
const profile = path.join(output, `profile-${Date.now()}`)
fs.mkdirSync(profile)
const original = path.join(process.env.APPDATA, 'FreeTube')
for (const name of ['settings', 'history', 'profiles', 'playlists', 'search-history', 'subscription-cache']) {
  const from = path.join(original, `${name}.db`)
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(profile, `${name}.db`))
}
fs.appendFileSync(path.join(profile, 'settings.db'), '\n' + [
  ['baseTheme', 'dark'], ['landingPage', 'home'], ['expandSideBar', true], ['checkForUpdates', false],
].map(([_id, value]) => JSON.stringify({ _id, value })).join('\n') + '\n')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = { startedAt: new Date().toISOString(), routes: [], exceptions: [], consoleErrors: [] }
let child, socket

async function main() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  const executable = process.env.CARTERTUBE_EXE || require('electron')
  child = spawn(executable, [...(process.env.CARTERTUBE_EXE ? [] : [root]), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stderr.on('data', data => { logs += data.toString() })
  child.stdout.on('data', data => { logs += data.toString() })
  child.on('error', error => { report.launchError = error.message })
  let target
  for (let n = 0; n < 100; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page' && item.url.startsWith('app:')) } catch {}
    if (target) break
    await delay(300)
  }
  assert(target, `Desktop window did not launch: ${logs.slice(-1500)}`)
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const handler = pending.get(message.id)
      if (handler) { pending.delete(message.id); message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result) }
    } else if (message.method === 'Runtime.exceptionThrown') {
      report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      report.consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(' ').slice(0, 600))
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id
    const timeout = setTimeout(() => { pending.delete(messageId); reject(new Error(`Timed out: ${method}`)) }, 20000)
    pending.set(messageId, { resolve: value => { clearTimeout(timeout); resolve(value) }, reject: error => { clearTimeout(timeout); reject(error) } })
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (expression, timeout = 30000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(250) }
    throw new Error(`Condition not reached: ${expression}`)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
  await until("Boolean(document.querySelector('.sideNav'))")
  report.brand = await evaluate("({title:document.title,wordmark:document.querySelector('.carterWordmark')?.textContent,bg:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.querySelector('.app')).fontFamily})")
  assert.equal(report.brand.wordmark, 'CarterTube')
  await delay(8000)
  report.home = await evaluate("({title:document.querySelector('h1')?.textContent, cards:document.querySelectorAll('.ft-list-video').length, text:document.querySelector('main,[role=main]')?.innerText?.slice(0,900)})")
  fs.writeFileSync(path.join(output, 'cartertube-home.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'))
  const watchRoute = await evaluate("document.querySelector('a[href*=\"/watch/\"]')?.getAttribute('href')")
  for (const route of ['settings', 'history', 'userplaylists', 'subscriptions', 'subscribedchannels', 'about', 'home']) {
    await evaluate(`location.hash=${JSON.stringify('/' + route)}`)
    await delay(600)
    await until(`document.title.includes('CarterTube') && location.hash.includes(${JSON.stringify(route)})`)
    const state = await evaluate("({title:document.title, text:document.querySelector('[role=main]')?.innerText?.slice(0,200), horizontalOverflow:document.documentElement.scrollWidth>innerWidth})")
    report.routes.push({ route, ...state })
    assert(state.text, `Empty ${route} page`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await delay(700)
  report.mobile = await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,navLinks:document.querySelectorAll('.sideNav a').length})")
  fs.writeFileSync(path.join(output, 'cartertube-mobile.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false })
  if (watchRoute) {
    await evaluate(`location.hash=${JSON.stringify(watchRoute.slice(watchRoute.indexOf('#') + 1))}`)
    await delay(12000)
    report.playbackStart = await evaluate("(() => { const v=document.querySelector('video'); return {title:document.title,time:v?.currentTime,paused:v?.paused,readyState:v?.readyState,error:v?.error?.message,text:document.querySelector('[role=main]')?.innerText?.slice(0,500)} })()")
    await evaluate("document.querySelector('video')?.play().catch(()=>{})")
    await delay(15000)
    report.playbackEnd = await evaluate("(() => { const v=document.querySelector('video'); return {time:v?.currentTime,paused:v?.paused,readyState:v?.readyState,error:v?.error?.message,playerControls:document.querySelectorAll('.shaka-controls-container button').length} })()")
    report.playbackAdvanced = report.playbackEnd.time > report.playbackStart.time + 5
    assert.equal(report.playbackAdvanced, true, 'Live video playback did not advance')
    report.player = await evaluate("(() => { const p=document.querySelector('video').ui.getControls().getPlayer(); return {auto:p.getConfiguration().abr.enabled,active:p.getVariantTracks().filter(t=>t.active).map(t=>({height:t.height,width:t.width,language:t.language})),captions:p.getTextTracks().length,stats:p.getStats(),config:{streaming:p.getConfiguration().streaming}} })()")
    if (process.env.CARTERTUBE_RECOVERY_QA) {
      await evaluate(`(() => {
        const v=document.querySelector('video'), p=v.ui.getControls().getPlayer();
        const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
        v.playbackRate=1.25; v.volume=0.6;
        const caption=p.getTextTracks()[0]; if(caption)p.selectTextTrack(caption);
        window.__qa={retry:0,reload:0,before:{time:v.currentTime,rate:v.playbackRate,volume:v.volume,caption:caption?.language},complete:false};
        const load=p.load.bind(p), retry=p.retryStreaming.bind(p), frozenTime=v.currentTime;
        p.retryStreaming=(...args)=>{window.__qa.retry++;return retry(...args)};
        p.load=async(...args)=>{window.__qa.reload++;delete v.currentTime;const result=await load(...args);window.__qa.complete=true;return result};
        Object.defineProperty(v,'currentTime',{configurable:true,get:()=>frozenTime,set:value=>descriptor.set.call(v,value)});
      })()`)
      await until('window.__qa.complete', 55000)
      await delay(2500)
      report.recovery = await evaluate("(() => {const v=document.querySelector('video'),p=v.ui.getControls().getPlayer();return {...window.__qa,after:{time:v.currentTime,rate:v.playbackRate,volume:v.volume,paused:v.paused,caption:p.getTextTracks().find(t=>t.active)?.language,height:p.getVariantTracks().find(t=>t.active)?.height}}})()")
      assert.equal(report.recovery.reload, 1, 'Stall reload must be bounded to one')
      assert(report.recovery.retry >= 1, 'Stall must retry streaming before reloading')
      assert.equal(report.recovery.after.rate, 1.25, 'Recovery lost playback speed')
      assert.equal(report.recovery.after.volume, 0.6, 'Recovery lost volume')
      assert.equal(report.recovery.after.paused, false, 'Recovery did not resume')
      if (report.recovery.before.caption) assert.equal(report.recovery.after.caption, report.recovery.before.caption, 'Recovery lost caption language')
    }
    fs.writeFileSync(path.join(output, 'cartertube-watch.png'), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'))
  }
  report.passed = report.exceptions.length === 0
  report.logs = logs.slice(-3000)
  assert.equal(report.mobile.overflow, false, 'Mobile page overflows viewport')
  assert.equal(report.exceptions.length, 0, 'Uncaught runtime errors')
}

main().catch(error => { report.passed = false; report.failure = error.stack; process.exitCode = 1 }).finally(() => {
  fs.writeFileSync(path.join(output, 'smoke-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  socket?.close()
  child?.kill()
})
