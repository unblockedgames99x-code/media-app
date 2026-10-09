import { Volume2, VolumeX } from 'lucide-react';
import { FC } from 'react';

import { Button, Slider } from '..';
import { cn } from '../../utils';

type PlayerBarVolumeProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  muteLabel?: string;
  unmuteLabel?: string;
  volumeLabel?: string;
  disabled?: boolean;
  className?: string;
};

export const PlayerBarVolume: FC<PlayerBarVolumeProps> = ({
  value,
  defaultValue,
  onValueChange,
  isMuted = false,
  onMuteToggle,
  muteLabel = 'Mute',
  unmuteLabel = 'Unmute',
  volumeLabel = 'Volume',
  disabled,
  className = '',
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        size="icon"
        variant="text"
        disabled={disabled}
        onClick={onMuteToggle}
        aria-label={isMuted ? unmuteLabel : muteLabel}
        aria-pressed={isMuted}
        data-testid="player-mute-button"
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </Button>
      <div className="w-24" data-testid="player-volume-slider">
        <Slider
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          showValue={false}
          showFooter={false}
        >
          <div className="sr-only">
            <Slider.Header label={volumeLabel} showValue={false} />
          </div>
          <Slider.Surface>
            <Slider.Track />
            <Slider.RangeInput />
          </Slider.Surface>
        </Slider>
      </div>
    </div>
  );
};
