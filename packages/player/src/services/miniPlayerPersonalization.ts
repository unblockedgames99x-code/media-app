import type { PersonalizationSettings } from '../stores/personalizationStore';

type Appearance = {
  identity: PersonalizationSettings['identity'];
  themeSync: boolean;
};

type OriginalPanel = {
  marker: string | null;
  themeSync: string | null;
};

type OriginalIdentity = {
  children: Node[];
  marker: string | null;
};

const restoreAttribute = (
  element: HTMLElement,
  name: string,
  value: string | null,
) => {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
};

export const observeMiniPlayerPersonalization = (initial: Appearance) => {
  let appearance = initial;
  let disposed = false;
  const panels = new Map<HTMLElement, OriginalPanel>();
  const identities = new Map<HTMLElement, OriginalIdentity>();

  const restoreIdentity = (label: HTMLElement, original: OriginalIdentity) => {
    label.replaceChildren(...original.children);
    restoreAttribute(label, 'data-media-mini-identity', original.marker);
  };

  const restorePanel = (panel: HTMLElement, original: OriginalPanel) => {
    restoreAttribute(panel, 'data-media-mini-player', original.marker);
    restoreAttribute(panel, 'data-media-theme-sync', original.themeSync);
  };

  const apply = () => {
    if (disposed) {
      return;
    }
    for (const [label, original] of identities) {
      if (!label.isConnected) {
        restoreIdentity(label, original);
        identities.delete(label);
      }
    }
    for (const [panel, original] of panels) {
      if (!panel.isConnected) {
        restorePanel(panel, original);
        panels.delete(panel);
      }
    }
    const panel = document.getElementById('nuke-mp-panel');
    const header = document.getElementById('nuke-mp-header');
    if (!panel || !header || !panel.contains(header)) {
      return;
    }
    const label = Array.from(header.children).find(
      (element): element is HTMLSpanElement =>
        element instanceof HTMLSpanElement,
    );
    if (!label) {
      return;
    }
    if (!panels.has(panel)) {
      panels.set(panel, {
        marker: panel.getAttribute('data-media-mini-player'),
        themeSync: panel.getAttribute('data-media-theme-sync'),
      });
    }
    if (!identities.has(label)) {
      identities.set(label, {
        children: Array.from(label.childNodes),
        marker: label.getAttribute('data-media-mini-identity'),
      });
    }
    if (panel.dataset.mediaMiniPlayer !== 'true') {
      panel.dataset.mediaMiniPlayer = 'true';
    }
    const themeSync = String(appearance.themeSync);
    if (panel.dataset.mediaThemeSync !== themeSync) {
      panel.dataset.mediaThemeSync = themeSync;
    }
    if (label.dataset.mediaMiniIdentity !== 'true') {
      label.dataset.mediaMiniIdentity = 'true';
    }
    const { displayName, logoDataUrl } = appearance.identity;
    const image = label.firstElementChild;
    const logoMatches = logoDataUrl
      ? image instanceof HTMLImageElement &&
        image.getAttribute('src') === logoDataUrl &&
        label.children.length === 1
      : label.children.length === 0;
    if (label.textContent === displayName && logoMatches) {
      return;
    }
    const children: Node[] = [];
    if (logoDataUrl) {
      const logo = document.createElement('img');
      logo.src = logoDataUrl;
      logo.alt = '';
      logo.width = 18;
      logo.height = 18;
      children.push(logo);
    }
    if (displayName) {
      children.push(document.createTextNode(displayName));
    }
    label.replaceChildren(...children);
  };

  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  apply();

  return {
    update(next: Appearance) {
      appearance = next;
      apply();
    },
    disconnect() {
      disposed = true;
      observer.disconnect();
      for (const [label, original] of identities) {
        restoreIdentity(label, original);
      }
      for (const [panel, original] of panels) {
        restorePanel(panel, original);
      }
      identities.clear();
      panels.clear();
    },
  };
};
