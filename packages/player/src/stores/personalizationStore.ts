import { LazyStore } from '@tauri-apps/plugin-store';
import { z } from 'zod';
import { create } from 'zustand';
import { persist, PersistStorage, StorageValue } from 'zustand/middleware';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const fontChoice = z.enum(['system', 'sans', 'serif', 'mono', 'custom']);
const fontFamily = z
  .string()
  .max(120)
  .regex(/^[\p{L}\p{N} _,'".-]*$/u);
const rasterDataUrl = z
  .string()
  .max(2_800_000)
  .refine(
    (value) =>
      value === '' ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value),
  );

export const personalizationSchema = z
  .object({
    identity: z
      .object({
        displayName: z.string().max(40),
        logoDataUrl: rasterDataUrl,
      })
      .strict(),
    typography: z
      .object({
        bodyFont: fontChoice,
        headingFont: fontChoice,
        customBodyFont: fontFamily,
        customHeadingFont: fontFamily,
        size: z.number().min(12).max(22),
        lineHeight: z.number().min(1.2).max(2),
        weight: z.number().min(300).max(700),
      })
      .strict(),
    palette: z
      .object({
        enabled: z.boolean(),
        background: color,
        surface: color,
        foreground: color,
        muted: color,
        accent: color,
        accentForeground: color,
        border: color,
      })
      .strict(),
    layout: z
      .object({
        density: z.enum(['comfortable', 'compact', 'spacious']),
        cornerRadius: z.number().min(0).max(24),
        borderWidth: z.number().min(0).max(4),
        shadow: z.number().min(0).max(16),
        sidebarWidth: z.number().min(160).max(360),
        sidebarCollapsed: z.boolean(),
        artworkShape: z.enum(['rounded', 'square', 'circle']),
        artworkSaturation: z.number().min(0).max(150),
        showArtwork: z.boolean(),
        contentWidth: z.number().min(0).max(1800),
        uiScale: z.number().min(80).max(130),
        motion: z.enum(['full', 'reduced', 'none']),
        showTooltips: z.boolean(),
      })
      .strict(),
    background: z
      .object({
        style: z.enum(['solid', 'gradient', 'image']),
        gradientEnd: color,
        gradientAngle: z.number().min(0).max(360),
        imageDataUrl: rasterDataUrl,
        imageOpacity: z.number().min(0).max(60),
        blur: z.number().min(0).max(24),
      })
      .strict(),
    sounds: z
      .object({
        enabled: z.boolean(),
        volume: z.number().min(0).max(100),
        tone: z.enum(['soft', 'bright', 'digital']),
        selection: z.boolean(),
        navigation: z.boolean(),
        notification: z.boolean(),
      })
      .strict(),
    audio: z
      .object({
        enabled: z.boolean(),
        bass: z.number().min(-12).max(12),
        mid: z.number().min(-12).max(12),
        treble: z.number().min(-12).max(12),
        balance: z.number().min(-1).max(1),
        mono: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PersonalizationSettings = z.infer<typeof personalizationSchema>;
export type PersonalizationSection = keyof PersonalizationSettings;

export const defaultPersonalization: PersonalizationSettings = {
  identity: { displayName: '', logoDataUrl: '' },
  typography: {
    bodyFont: 'system',
    headingFont: 'system',
    customBodyFont: '',
    customHeadingFont: '',
    size: 16,
    lineHeight: 1.5,
    weight: 400,
  },
  palette: {
    enabled: true,
    background: '#171719',
    surface: '#242426',
    foreground: '#ededf0',
    muted: '#a1a1aa',
    accent: '#a8b4ff',
    accentForeground: '#161625',
    border: '#414146',
  },
  layout: {
    density: 'comfortable',
    cornerRadius: 8,
    borderWidth: 1,
    shadow: 0,
    sidebarWidth: 200,
    sidebarCollapsed: false,
    artworkShape: 'rounded',
    artworkSaturation: 100,
    showArtwork: true,
    contentWidth: 0,
    uiScale: 100,
    motion: 'full',
    showTooltips: true,
  },
  background: {
    style: 'solid',
    gradientEnd: '#29293b',
    gradientAngle: 135,
    imageDataUrl: '',
    imageOpacity: 20,
    blur: 0,
  },
  sounds: {
    enabled: false,
    volume: 25,
    tone: 'soft',
    selection: true,
    navigation: true,
    notification: true,
  },
  audio: {
    enabled: false,
    bass: 0,
    mid: 0,
    treble: 0,
    balance: 0,
    mono: false,
  },
};

export const personalizationPresets = [
  {
    id: 'neutral',
    palette: defaultPersonalization.palette,
    typography: defaultPersonalization.typography,
    layout: { cornerRadius: 8, borderWidth: 1, shadow: 0 },
  },
  {
    id: 'linen',
    palette: {
      enabled: true,
      background: '#f4f0e8',
      surface: '#fffcf6',
      foreground: '#292723',
      muted: '#706b61',
      accent: '#8a542f',
      accentForeground: '#ffffff',
      border: '#c9c1b3',
    },
    typography: {
      ...defaultPersonalization.typography,
      headingFont: 'serif' as const,
    },
    layout: { cornerRadius: 12, borderWidth: 1, shadow: 0 },
  },
  {
    id: 'ocean',
    palette: {
      enabled: true,
      background: '#101c26',
      surface: '#1b2c3a',
      foreground: '#e3f1f5',
      muted: '#9db8c5',
      accent: '#67d9d0',
      accentForeground: '#102529',
      border: '#355364',
    },
    typography: defaultPersonalization.typography,
    layout: { cornerRadius: 16, borderWidth: 1, shadow: 0 },
  },
  {
    id: 'terminal',
    palette: {
      enabled: true,
      background: '#101412',
      surface: '#19231d',
      foreground: '#d6f2df',
      muted: '#8aa393',
      accent: '#8fe3a3',
      accentForeground: '#102016',
      border: '#395342',
    },
    typography: {
      ...defaultPersonalization.typography,
      bodyFont: 'mono' as const,
      headingFont: 'mono' as const,
    },
    layout: { cornerRadius: 0, borderWidth: 1, shadow: 0 },
  },
];

const profileSchema = z
  .object({
    version: z.literal(1),
    settings: personalizationSchema,
  })
  .strict();

type PersonalizationState = {
  settings: PersonalizationSettings;
  hydrated: boolean;
  persistenceError: boolean;
  setupCompleted: boolean;
  completeSetup: () => Promise<void>;
  restartSetup: () => void;
  updateSection: <Section extends PersonalizationSection>(
    section: Section,
    changes: Partial<PersonalizationSettings[Section]>,
  ) => void;
  applyPreset: (presetId: string) => void;
  reset: () => void;
  importProfile: (json: string) => void;
  exportProfile: () => string;
};

const diskStore = new LazyStore('personalization.json');
let pendingWrite = Promise.resolve();
type SavedPersonalization = Pick<
  PersonalizationState,
  'settings' | 'setupCompleted'
>;
let pendingSnapshot: {
  name: string;
  value: StorageValue<SavedPersonalization>;
} | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let reportingPersistence = false;

const reportPersistence = (failed: boolean) => {
  if (usePersonalizationStore.getState().persistenceError !== failed) {
    reportingPersistence = true;
    usePersonalizationStore.setState({ persistenceError: failed });
    reportingPersistence = false;
  }
};

const writePendingSnapshot = (): Promise<void> => {
  clearTimeout(writeTimer);
  const snapshot = pendingSnapshot;
  if (!snapshot) {
    return pendingWrite;
  }
  pendingSnapshot = null;
  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      try {
        await diskStore.set(snapshot.name, snapshot.value);
        await diskStore.save();
        reportPersistence(false);
      } catch {
        reportPersistence(true);
      }
    });
  return pendingWrite;
};

export const flushPersonalizationPersistence = async (): Promise<void> => {
  await writePendingSnapshot();
  while (pendingSnapshot) {
    await writePendingSnapshot();
  }
};

const personalizationStorage: PersistStorage<SavedPersonalization> = {
  getItem: async (name) => {
    await flushPersonalizationPersistence();
    const saved = await diskStore.get<
      string | StorageValue<SavedPersonalization>
    >(name);
    if (saved !== null && saved !== undefined) {
      return typeof saved === 'string'
        ? (JSON.parse(saved) as StorageValue<SavedPersonalization>)
        : saved;
    }
    const legacy = localStorage.getItem(name);
    if (!legacy) {
      return null;
    }
    const legacyState = JSON.parse(
      legacy,
    ) as StorageValue<SavedPersonalization> & {
      state?: { settings?: unknown };
    };
    if (!personalizationSchema.safeParse(legacyState.state?.settings).success) {
      return null;
    }
    await diskStore.set(name, legacyState);
    await diskStore.save();
    return legacyState;
  },
  setItem: (name, value) => {
    if (reportingPersistence) {
      return;
    }
    pendingSnapshot = { name, value };
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      void writePendingSnapshot();
    }, 180);
  },
  removeItem: async (name) => {
    await flushPersonalizationPersistence();
    await diskStore.delete(name);
    await diskStore.save();
  },
};

export const retryPersonalizationPersistence = async (): Promise<boolean> => {
  const { settings, setupCompleted } = usePersonalizationStore.getState();
  await personalizationStorage.setItem('media-personalization', {
    state: { settings, setupCompleted },
    version: 1,
  });
  await flushPersonalizationPersistence();
  return !usePersonalizationStore.getState().persistenceError;
};

export const usePersonalizationStore = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      settings: structuredClone(defaultPersonalization),
      hydrated: false,
      persistenceError: false,
      setupCompleted: false,
      completeSetup: async () => {
        await flushPersonalizationPersistence();
        await personalizationStorage.setItem('media-personalization', {
          state: { settings: get().settings, setupCompleted: true },
          version: 1,
        });
        await flushPersonalizationPersistence();
        if (get().persistenceError) {
          throw new Error('Personalization could not be saved');
        }
        set({ setupCompleted: true });
      },
      restartSetup: () => {
        set({ setupCompleted: false });
      },
      updateSection: (section, changes) => {
        const previous = get().settings;
        const result = personalizationSchema.shape[section].safeParse({
          ...previous[section],
          ...changes,
        });
        if (result.success) {
          set({ settings: { ...previous, [section]: result.data } });
        }
      },
      applyPreset: (presetId) => {
        const preset = personalizationPresets.find(
          (entry) => entry.id === presetId,
        );
        if (!preset) {
          return;
        }
        const previous = get().settings;
        set({
          settings: personalizationSchema.parse({
            ...previous,
            palette: preset.palette,
            typography: preset.typography,
            layout: { ...previous.layout, ...preset.layout },
            background: { ...previous.background, style: 'solid' },
          }),
        });
      },
      reset: () => {
        set({ settings: structuredClone(defaultPersonalization) });
      },
      importProfile: (json) => {
        if (json.length > 5_700_000) {
          throw new Error('Invalid personalization profile');
        }
        const profile = profileSchema.parse(JSON.parse(json));
        set({ settings: profile.settings });
      },
      exportProfile: () =>
        JSON.stringify({ version: 1, settings: get().settings }, null, 2),
    }),
    {
      name: 'media-personalization',
      version: 1,
      skipHydration: true,
      storage: personalizationStorage,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          usePersonalizationStore.setState({
            settings: structuredClone(defaultPersonalization),
            persistenceError: true,
          });
        }
      },
      partialize: ({ settings, setupCompleted }) => ({
        settings,
        setupCompleted,
      }),
      merge: (persisted, current) => {
        const parsed = personalizationSchema.safeParse(
          (persisted as { settings?: unknown } | undefined)?.settings,
        );
        const setupCompleted =
          (persisted as { setupCompleted?: unknown } | undefined)
            ?.setupCompleted === true;
        return {
          ...current,
          setupCompleted,
          settings: parsed.success
            ? parsed.data
            : structuredClone(defaultPersonalization),
        };
      },
    },
  ),
);

let initialization: Promise<void> | null = null;

export const initializePersonalization = (): Promise<void> => {
  initialization ??= Promise.resolve(
    usePersonalizationStore.persist.rehydrate(),
  )
    .catch(() => {
      usePersonalizationStore.setState({
        settings: structuredClone(defaultPersonalization),
        persistenceError: true,
      });
    })
    .finally(() => usePersonalizationStore.setState({ hydrated: true }));
  return initialization;
};
