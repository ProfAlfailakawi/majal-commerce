import { useEffect, useRef } from 'react';

/**
 * Dismissal behaviour for lightweight popovers (notification tray, role menu).
 *
 * Deliberately NOT useDialogBehavior: that hook locks body scroll and traps focus,
 * which is correct for a modal but wrong for a menu anchored to the header — the
 * page behind a menu should stay scrollable and Tab should be able to leave it.
 * What a popover does owe the user is the two dismissals they already expect:
 * Escape, and a click anywhere outside it.
 */
export function usePopoverDismiss<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
      // Return focus to the trigger so keyboard users are not dropped at the page root.
      containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return containerRef;
}
