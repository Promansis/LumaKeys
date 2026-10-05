import type { ReactNode } from 'react';
import { useState } from 'react';

export type ImmersiveHudDestination =
  | 'main-menu'
  | 'library'
  | 'learn-hub'
  | 'free-play'
  | 'soundboard'
  | 'theory-hub'
  | 'progress-dashboard'
  | 'settings';

export interface ImmersiveHudNavigationItem {
  key: ImmersiveHudDestination;
  label: string;
  title: string;
  onSelect: () => void;
}

interface ImmersiveHudProps {
  className?: string;
  currentDestination?: ImmersiveHudDestination;
  label?: string;
  navigationItems?: ImmersiveHudNavigationItem[];
  externalHover?: boolean;
  stats: ReactNode;
  actions: ReactNode;
}

export function ImmersiveHud({
  className = '',
  currentDestination,
  label = 'Session HUD',
  navigationItems = [],
  externalHover = false,
  stats,
  actions,
}: ImmersiveHudProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isOpen = isPinned || isHovered || hasFocus || externalHover;
  const classNames = ['immersive-hud-shell', isOpen ? 'open' : '', className].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      data-testid="immersive-hud-shell"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => {
        if (!isPinned) {
          setIsHovered(false);
        }
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(true);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false);
        }
      }}
    >
      <div className="immersive-hud-hover-zone" aria-hidden="true" />
      <button
        className="immersive-hud-tab"
        type="button"
        aria-label="Show play HUD"
        aria-expanded={isOpen}
        onClick={() => {
          setIsPinned((current) => !current);
          setIsHovered(false);
        }}
        >
        HUD
      </button>
      <div className="immersive-hud" aria-label={label}>
        <div className="immersive-hud-core">
          {stats}
        </div>
        {navigationItems.length > 0 ? (
          <nav className="immersive-hud-nav" aria-label="Play screen navigation">
            {navigationItems.map((item) => {
              const isCurrent = item.key === currentDestination;
              return (
                <button
                  key={item.key}
                  className={`immersive-hud-nav-btn${isCurrent ? ' active' : ''}`}
                  type="button"
                  title={item.title}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => {
                    if (!isCurrent) {
                      setIsPinned(false);
                      setIsHovered(false);
                      item.onSelect();
                    }
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="immersive-hud-actions">
          {actions}
        </div>
      </div>
    </div>
  );
}
