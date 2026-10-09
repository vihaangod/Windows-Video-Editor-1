import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  action: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  hint?: string;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(() => items.findIndex((item) => !item.disabled));
  const enabledIndexes = items.flatMap((item, index) => item.disabled ? [] : [index]);
  const height = Math.min(360, items.length * 36 + items.filter((item) => item.separatorBefore).length);
  const position = {
    left: Math.max(8, Math.min(x, window.innerWidth - 248)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };

  useEffect(() => {
    itemRefs.current[activeIndex]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!enabledIndexes.length) return;
      const current = enabledIndexes.indexOf(activeIndex);
      let next = current;
      if (event.key === 'ArrowDown') next = (current + 1) % enabledIndexes.length;
      else if (event.key === 'ArrowUp') next = (current - 1 + enabledIndexes.length) % enabledIndexes.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = enabledIndexes.length - 1;
      else return;
      event.preventDefault();
      setActiveIndex(enabledIndexes[next]);
      itemRefs.current[enabledIndexes[next]]?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, enabledIndexes, onClose]);

  return (
    <div
      ref={menuRef}
      className="cutline-context-menu"
      role="menu"
      aria-label="Cutline actions"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          ref={(element) => { itemRefs.current[index] = element; }}
          type="button"
          role="menuitem"
          tabIndex={index === activeIndex ? 0 : -1}
          className={`cutline-context-menu__item${item.destructive ? ' is-destructive' : ''}${item.separatorBefore ? ' has-separator' : ''}`}
          disabled={item.disabled}
          title={item.hint}
          onFocus={() => setActiveIndex(index)}
          onClick={() => {
            if (item.disabled) return;
            item.action();
            onClose();
          }}
        >
          <span className="cutline-context-menu__icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
          {item.hint && <small>{item.hint}</small>}
        </button>
      ))}
    </div>
  );
}
