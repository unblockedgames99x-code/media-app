import { getCurrentWindow } from '@tauri-apps/api/window';
import { FC, useEffect, useRef } from 'react';

import { playInterfaceSound } from '../services/interfaceSounds';
import { getPersonalizationVariables } from '../services/personalization';
import { getPersonalizationGradientEnd } from '../services/personalizationPalette';
import { useLayoutStore } from '../stores/layoutStore';
import { usePersonalizationStore } from '../stores/personalizationStore';

import './personalization.css';

export const PersonalizationController: FC = () => {
  const settings = usePersonalizationStore((state) => state.settings);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.personalization = '';
    document.head.append(style);
    styleRef.current = style;
    return () => style.remove();
  }, []);

  useEffect(() => {
    const style = styleRef.current;
    const variables = getPersonalizationVariables(settings);
    const { layout } = settings;
    variables['--personal-content-width'] = layout.contentWidth
      ? `${layout.contentWidth}px`
      : '100%';
    if (style) {
      style.textContent = `:root:root{${Object.entries(variables)
        .map(([key, value]) => `${key}:${value} !important`)
        .join(';')}}`;
    }
    document.documentElement.dataset.motion = layout.motion;
    document.documentElement.dataset.artwork = layout.showArtwork
      ? 'visible'
      : 'hidden';
    document.documentElement.dataset.tooltips = layout.showTooltips
      ? 'visible'
      : 'hidden';
  }, [settings]);

  useEffect(() => {
    const background = settings.background;
    const values = {
      '--personal-wallpaper':
        background.style === 'gradient'
          ? `linear-gradient(${background.gradientAngle}deg, var(--background), ${getPersonalizationGradientEnd(settings)})`
          : background.style === 'image' && background.imageDataUrl
            ? `url("${background.imageDataUrl}")`
            : 'none',
      '--personal-wallpaper-opacity':
        background.style === 'gradient'
          ? '1'
          : String(background.imageOpacity / 100),
      '--personal-wallpaper-blur': `${background.blur}px`,
    };
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(values)) {
      if (style.getPropertyValue(key) !== value) {
        style.setProperty(key, value);
      }
    }
  }, [settings.background, settings.palette]);

  useEffect(() => {
    document.title = settings.identity.displayName || 'Media';
    void getCurrentWindow()
      .setTitle(settings.identity.displayName || 'Media')
      .catch(() => {});
  }, [settings.identity.displayName]);

  useEffect(() => {
    useLayoutStore.setState((state) => ({
      leftSidebar: {
        ...state.leftSidebar,
        width: settings.layout.sidebarWidth,
        isCollapsed: settings.layout.sidebarCollapsed,
      },
    }));
  }, [settings.layout.sidebarWidth, settings.layout.sidebarCollapsed]);

  useEffect(() => {
    const preview = () =>
      playInterfaceSound(
        usePersonalizationStore.getState().settings.sounds,
        true,
      );
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest('button,a,[role="tab"]')
          : null;
      if (!target) {
        return;
      }
      const sounds = usePersonalizationStore.getState().settings.sounds;
      const navigation =
        target.tagName === 'A' || target.getAttribute('role') === 'tab';
      if (navigation ? sounds.navigation : sounds.selection) {
        playInterfaceSound(sounds);
      }
    };
    window.addEventListener('personalization:preview-sound', preview);
    document.addEventListener('click', click);
    return () => {
      window.removeEventListener('personalization:preview-sound', preview);
      document.removeEventListener('click', click);
    };
  }, []);

  useEffect(() => {
    if (!settings.sounds.enabled || !settings.sounds.notification) {
      return;
    }
    const announced = new WeakSet<Element>();
    const observer = new MutationObserver(() => {
      for (const alert of document.querySelectorAll(
        '[data-sonner-toast][data-mounted="true"]',
      )) {
        if (!announced.has(alert)) {
          announced.add(alert);
          playInterfaceSound(
            usePersonalizationStore.getState().settings.sounds,
          );
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [settings.sounds.enabled, settings.sounds.notification]);

  return null;
};
