/**
 * Bound a complete operation, including IPC or library promises that cannot be
 * cancelled directly. Fetches use the supplied signal, and later stages should
 * check it before continuing. Successful results can retain their fetch client.
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} task
 * @param {{ timeoutMs?: number, signal?: AbortSignal, message?: string }} [options]
 * @returns {Promise<T>}
 */
export async function withRequestDeadline (task, { timeoutMs = 45000, signal, message = 'Video information request timed out. Please retry.' } = {}) {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort(signal.reason)
  let timer
  let onAbort
  let succeeded = false

  if (signal) {
    if (signal.aborted) onParentAbort()
    else signal.addEventListener('abort', onParentAbort, { once: true })
  }

  try {
    const cancelled = new Promise((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'))
      if (controller.signal.aborted) {
        onAbort()
        return
      }
      controller.signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        const error = new Error(message)
        error.name = 'TimeoutError'
        controller.abort(error)
      }, timeoutMs)
    })
    const result = await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return task(controller.signal)
      }),
      cancelled,
    ])
    succeeded = true
    return result
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    if (signal) signal.removeEventListener('abort', onParentAbort)
    // Do not abort a successful session: VideoInfo retains its actions client
    // for features such as continuations and later format operations.
    if (!succeeded) controller.abort()
  }
}
