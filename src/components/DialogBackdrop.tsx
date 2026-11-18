import type { HTMLAttributes, ReactNode } from "react";

import { useDialog } from "../lib/useDialog";

type Props = HTMLAttributes<HTMLDivElement> & {
  onClose: () => void;
  children?: ReactNode;
};

// The outer element of a modal (the dimmed backdrop). Rendering it gives the
// modal Escape-to-close, a focus trap, focus restore and a scroll-locked page;
// render it only while the modal is open.
export function DialogBackdrop({ onClose, children, ...rest }: Props) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}
