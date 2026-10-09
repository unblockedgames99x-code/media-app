import { Link } from '@tanstack/react-router';
import { FC, KeyboardEvent, ReactNode } from 'react';

import { cn } from '../../utils';
import { Tooltip } from '../Tooltip/Tooltip';
import { useSidebarCompact } from './SidebarCompactContext';

import './SidebarNavigationItem.css';

type SidebarNavigationItemProps = {
  icon: ReactNode;
  label: string;
  isSelected?: boolean;
  to?: string;
  onClick?: () => void;
};

const MaybeNavLink: FC<{
  to?: string;
  isSelected?: boolean;
  children: (isSelected: boolean) => ReactNode;
}> = ({ to, isSelected = false, children }) => {
  if (to) {
    return (
      <Link to={to} className="sidebar-navigation-link">
        {({ isActive }) => children(isActive)}
      </Link>
    );
  }
  return <>{children(isSelected)}</>;
};

export const SidebarNavigationItem: FC<SidebarNavigationItemProps> = ({
  icon,
  label,
  isSelected,
  to,
  onClick,
}) => {
  const isCompact = useSidebarCompact();
  const ItemElement = onClick ? 'button' : 'div';

  return (
    <MaybeNavLink to={to} isSelected={isSelected}>
      {(active) => (
        <Tooltip content={label} side="right" disabled={!isCompact}>
          <ItemElement
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            onKeyDown={
              onClick
                ? (event: KeyboardEvent<HTMLElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                    }
                  }
                : undefined
            }
            aria-label={onClick ? label : undefined}
            aria-pressed={onClick ? active : undefined}
            data-selected={active}
            data-testid="sidebar-navigation-item"
            className={cn(
              'sidebar-navigation-item flex w-full items-center overflow-hidden rounded-md border-(length:--border-width) text-left',
              {
                'cursor-pointer': onClick,
                'surface-primary border-border font-bold': active,
                'border-transparent': !active,
              },
            )}
          >
            <div className="flex size-8 shrink-0 items-center justify-center">
              {icon}
            </div>
            <span
              className={cn(
                'text-sm whitespace-nowrap transition-opacity duration-150',
                {
                  'opacity-0': isCompact,
                  'opacity-100': !isCompact,
                },
              )}
            >
              {label}
            </span>
          </ItemElement>
        </Tooltip>
      )}
    </MaybeNavLink>
  );
};
