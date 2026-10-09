import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { PlayerBar } from '@nuclearplayer/ui';

import { useCoreSetting } from '../../hooks/useCoreSetting';

export const ConnectedVolume: FC = () => {
  const { t } = useTranslation('playerBar');
  const [volume, setVolume] = useCoreSetting<number>('playback.volume');
  const [muted, setMuted] = useCoreSetting<boolean>('playback.muted');

  const handleVolumeChange = (value: number) => {
    setVolume(value / 100);
    if (muted) {
      setMuted(false);
    }
  };

  return (
    <PlayerBar.Volume
      value={Math.round((volume ?? 1) * 100)}
      onValueChange={handleVolumeChange}
      isMuted={muted ?? false}
      onMuteToggle={() => setMuted(!muted)}
      muteLabel={t('mute')}
      unmuteLabel={t('unmute')}
      volumeLabel={t('volume')}
    />
  );
};
