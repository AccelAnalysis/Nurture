import { useEffect, useId, useRef, type PropsWithChildren } from 'react';
import { Button } from './ui';
import { Icon } from './Icon';
export function Modal({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={onClose} onClose={onClose}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <Button variant="quiet" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
