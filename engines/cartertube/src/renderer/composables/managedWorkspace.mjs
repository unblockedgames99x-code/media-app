import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useManagedWorkspace (pageDocument = document, eventTarget = window) {
  const readMode = () => {
    const root = pageDocument.documentElement
    const mode = root.dataset.workspaceMode
    return root.classList.contains('carterMediaEmbedded') && ['embedded', 'handoff', 'window'].includes(mode) ? mode : null
  }
  const workspaceMode = ref(readMode())
  const updateMode = () => { workspaceMode.value = readMode() }

  onMounted(() => {
    eventTarget.addEventListener('cartermedia:workspace', updateMode)
    updateMode()
  })
  onBeforeUnmount(() => eventTarget.removeEventListener('cartermedia:workspace', updateMode))

  return {
    isManagedWorkspace: computed(() => workspaceMode.value !== null),
    isEmbeddedWorkspace: computed(() => workspaceMode.value === 'embedded'),
  }
}
