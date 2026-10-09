import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export const readPersonalizationImage = (file: File): Promise<string> => {
  if (
    file.size > 2_000_000 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  ) {
    return Promise.reject(new Error('Invalid personalization image'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Image could not be read'));
    reader.onerror = () => reject(new Error('Image could not be read'));
    reader.readAsDataURL(file);
  });
};

export const savePersonalizationProfile = async (
  json: string,
): Promise<boolean> => {
  const path = await save({
    defaultPath: 'media-profile.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!path) {
    return false;
  }
  await writeTextFile(path, json);
  return true;
};
