import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connect } from './cdp.mjs';

const createConnection = async (context, beforeRuntime) => {
  const events = [];
  const sockets = [];
  class DebugSocket {
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = DebugSocket.OPEN;
    commands = [];

    constructor() {
      sockets.push(this);
      queueMicrotask(() => this.onopen());
    }

    send(data) {
      if (this.readyState !== DebugSocket.OPEN) {
        return;
      }
      const command = JSON.parse(data);
      this.commands.push(command);
      if (command.method === 'QA.waitForResponse') {
        return;
      }
      queueMicrotask(() =>
        this.onmessage({
          data: JSON.stringify({
            id: command.id,
            result:
              command.method === 'Runtime.evaluate'
                ? { result: { value: true } }
                : {},
          }),
        }),
      );
    }

    close() {
      this.readyState = DebugSocket.CLOSED;
      this.onclose?.({ code: 1006 });
    }
  }
  context.mock.method(globalThis, 'fetch', async () => ({
    json: async () => [
      {
        type: 'page',
        url: 'app://bundle/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1/qa',
      },
    ],
  }));
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = DebugSocket;
  context.after(() => {
    globalThis.WebSocket = originalWebSocket;
  });
  const connection = await connect(
    12345,
    (target) => target.type === 'page',
    1000,
    (event) => events.push(event),
    beforeRuntime,
  );
  context.after(() => connection.close());
  return { connection, socket: sockets[0], events, DebugSocket };
};

test('CDP commands still resolve through a live connection', async (context) => {
  const { connection, socket } = await createConnection(context);
  assert.deepEqual(await connection.send('Page.enable'), {});
  assert.equal(await connection.evaluate('true'), true);
  assert.equal(socket.commands.at(-1).method, 'Runtime.evaluate');
});

test('CDP waits for the DOM readiness probe before enabling script contexts', async (context) => {
  const { socket } = await createConnection(context, async (send) => {
    await send('DOM.getDocument', { depth: 1 });
    await send('DOM.getDocument', { depth: 1 });
  });
  assert.deepEqual(
    socket.commands.slice(0, 3).map((command) => command.method),
    ['DOM.getDocument', 'DOM.getDocument', 'Runtime.enable'],
  );
});

test('CDP closes pending commands and clears their timeout', async (context) => {
  const { connection, socket, events } = await createConnection(context);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const response = connection.send('QA.waitForResponse');
  const rejection = assert.rejects(response, /debugging connection closed/);
  socket.close();
  await rejection;
  context.mock.timers.tick(35000);
  assert.equal(
    events.some((event) => event.event === 'timeout'),
    false,
  );
});

for (const state of ['CLOSING', 'CLOSED']) {
  test(`CDP rejects new commands immediately while ${state.toLowerCase()}`, async (context) => {
    const { connection, socket, events, DebugSocket } =
      await createConnection(context);
    context.mock.timers.enable({ apis: ['setTimeout'] });
    socket.readyState = DebugSocket[state];
    const sentBefore = socket.commands.length;
    const rejection = assert.rejects(
      connection.send('Runtime.evaluate', { expression: 'true' }),
      /debugging connection closed/,
    );
    context.mock.timers.tick(35000);
    await rejection;
    assert.equal(socket.commands.length, sentBefore);
    assert.equal(
      events.some((event) => event.event === 'timeout'),
      false,
    );
    assert.equal(events.at(-1).event, 'failed');
    assert.equal(events.at(-1).command, 'Runtime.evaluate: true');
  });
}
