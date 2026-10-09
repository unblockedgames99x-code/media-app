import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Popover, Tooltip } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { usePersonalizationStore } from '../stores/personalizationStore';
import { InfoField } from '../views/Settings/InfoField';

export const JamQrCodeButton: FC = () => {
  const { t } = useTranslation('remote');
  const logo = usePersonalizationStore(
    (state) => state.settings.identity.logoDataUrl,
  );
  const [jamEnabled] = useCoreSetting<boolean>('integrations.jam.enabled');
  const [remoteUrl] = useCoreSetting<string>('integrations.jam.remoteUrl');

  if (!jamEnabled) {
    return null;
  }

  return (
    <Tooltip content={t('qrCode.tooltip')} side="bottom">
      <Popover
        trigger={<QrCode size={20} />}
        anchor="bottom"
        className="relative"
        panelClassName="flex max-w-80 w-80 flex-col items-center gap-2 p-4"
      >
        <QRCodeSVG
          className="text-primary rounded-lg"
          value={remoteUrl ?? ''}
          size={200}
          fgColor="currentColor"
          bgColor="#ffffff"
          marginSize={2}
          imageSettings={
            logo
              ? {
                  src: logo,
                  height: 40,
                  width: 40,
                  excavate: true,
                }
              : undefined
          }
        />
        <InfoField label={t('qrCode.instructions')} value={remoteUrl} />
      </Popover>
    </Tooltip>
  );
};
