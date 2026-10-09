import net from 'node:net';

export const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export const freePort = async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};

export const connect = async (port, accepts, timeout = 40000, progress = () => {}) => {
  let target;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find(accepts);
      if (target) break;
    } catch {}
    await delay(250);
  }
  if (!target) throw new Error(`No application page appeared on QA port ${port}`);
  progress({ event: 'target', type: target.type, url: target.url });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const description = message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text;
      exceptions.push(description);
      progress({ event: 'exception', description });
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const description = message.params.args.map(argument => argument.value || argument.description).join(' ').slice(0, 700);
      errors.push(description);
      progress({ event: 'console-error', description });
    } else if (['Inspector.targetCrashed', 'Inspector.detached', 'Page.loadEventFired'].includes(message.method)) {
      progress({ event: message.method, reason: message.params?.reason });
    }
  };
  socket.onclose = event => {
    progress({ event: 'disconnected', code: event.code });
    for (const handler of pending.values()) handler.reject(new Error('The application debugging connection closed.'));
    pending.clear();
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const startedAt = Date.now();
    const detail = params.expression ? `${method}: ${params.expression.slice(0, 300)}` : method;
    progress({ event: 'command', command: detail });
    const timer = setTimeout(() => {
      pending.delete(id);
      progress({ event: 'timeout', command: detail });
      reject(new Error(`QA command timed out: ${detail}`));
    }, 35000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); progress({ event: 'completed', command: detail, duration: Date.now() - startedAt }); resolve(result); },
      reject: error => { clearTimeout(timer); progress({ event: 'failed', command: detail, error: error.message }); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, timeout = 35000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = await evaluate(expression);
      if (result) return result;
      await delay(250);
    }
    throw new Error(`QA condition not reached: ${expression}`);
  };
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    const initializeDomQueries = `globalThis.qa = {
      tag: name => document.getElementsByTagName(name)[0],
      byClass: name => [...document.getElementsByClassName(name)],
      testId: value => [...document.getElementsByTagName('*')].find(element => element.getAttribute('data-testid') === value),
      role: value => [...document.getElementsByTagName('*')].find(element => element.getAttribute('role') === value),
      withPrefix: (attribute, value) => [...document.getElementsByTagName('*')].filter(element => element.getAttribute(attribute)?.startsWith(value)),
      link: href => [...document.getElementsByTagName('a')].find(element => element.getAttribute('href') === href),
      linksContaining: value => [...document.getElementsByTagName('a')].filter(element => element.getAttribute('href')?.includes(value))
    }`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: initializeDomQueries });
    await until("document.readyState==='complete'&&location.protocol!=='about:'");
    await evaluate(initializeDomQueries);
    await evaluate("document.addEventListener('play',event=>{if(['AUDIO','VIDEO'].includes(event.target.tagName))event.target.muted=true},true);for(const media of [...document.getElementsByTagName('audio'),...document.getElementsByTagName('video')])media.muted=true");
    await evaluate("if(window.__TAURI_INTERNALS__&&!globalThis.qaInvokeFailures){globalThis.qaInvokeFailures=[];const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(command,args,options)=>original(command,args,options).catch(error=>{if(command.startsWith('video_engine_'))qaInvokeFailures.push({command,error:String(error),time:Date.now()});throw error;})}");
    return { target, send, evaluate, until, exceptions, errors, close: () => socket.close() };
  } catch (error) {
    socket.close();
    throw error;
  }
};
