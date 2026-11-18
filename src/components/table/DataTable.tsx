import type {
  CSSProperties,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";

// Shared building blocks for every list-of-records table in the dashboard,
// so they all look and behave the same: one card, one header style, one
// hover/selected color, keyboard-openable rows, status badges, and loading /
// empty / error messages that sit inside the table instead of pushing it
// around. Screens keep rendering their own cells.

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function TableCard(props: {
  /** Left side of the summary bar, e.g. "24 registrations". */
  title?: ReactNode;
  /** Right side of the summary bar, e.g. the active filter. */
  meta?: ReactNode;
  /** Shown under the table (pagination, "load more"). */
  footer?: ReactNode;
  /** Cap the height so the header stays in view while the rows scroll. */
  maxHeight?: CSSProperties["maxHeight"];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("dt-card", props.className)}>
      {props.title !== undefined || props.meta !== undefined ? (
        <div className="dt-summary">
          <strong>{props.title}</strong>
          {props.meta !== undefined ? <span>{props.meta}</span> : null}
        </div>
      ) : null}
      <div
        className={cx("dt-scroll", props.maxHeight !== undefined && "dt-scroll-capped")}
        style={props.maxHeight !== undefined ? { maxHeight: props.maxHeight } : undefined}
      >
        {props.children}
      </div>
      {props.footer ? <div className="dt-footer">{props.footer}</div> : null}
    </div>
  );
}

export function DataTable(props: {
  /** Below this width the table scrolls sideways inside its card. */
  minWidth?: number;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  return (
    <table
      className={cx("dt", props.className)}
      style={props.minWidth ? { minWidth: props.minWidth } : undefined}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </table>
  );
}

export function DataRow(props: {
  /** Makes the whole row open something (click, Enter or Space). */
  onOpen?: () => void;
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { onOpen } = props;
  return (
    <tr
      className={cx(
        onOpen && "dt-row-clickable",
        props.selected && "dt-row-selected",
        props.className,
      )}
      tabIndex={onOpen ? 0 : undefined}
      aria-selected={props.selected || undefined}
      onClick={
        onOpen
          ? (event) => {
              // Buttons/links inside the row do their own thing.
              if ((event.target as HTMLElement).closest("button, a, input, select, label")) {
                return;
              }
              onOpen();
            }
          : undefined
      }
      onKeyDown={
        onOpen
          ? (event: KeyboardEvent<HTMLTableRowElement>) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      {props.children}
    </tr>
  );
}

/** A full-width row for loading / empty / error states. */
export function TableMessageRow(props: {
  colSpan: number;
  tone?: "loading" | "empty" | "error";
  children: ReactNode;
}) {
  const tone = props.tone ?? "empty";
  return (
    <tr className={cx("dt-message", `dt-message-${tone}`)}>
      <td colSpan={props.colSpan} role={tone === "error" ? "alert" : undefined}>
        {tone === "loading" ? <span className="dt-spinner" aria-hidden="true" /> : null}
        {props.children}
      </td>
    </tr>
  );
}

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent"
  | "neutral";

export function StatusBadge(props: {
  tone: StatusTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("dt-badge", `dt-badge-${props.tone}`, props.className)}
      title={props.title}
    >
      {props.children}
    </span>
  );
}

/** Filters on the left, search / actions on the right. */
export function TableToolbar(props: { className?: string; children: ReactNode }) {
  return <div className={cx("dt-toolbar", props.className)}>{props.children}</div>;
}

export function TableSearch(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      type="search"
      {...rest}
      className={cx("dt-search", className)}
      aria-label={rest["aria-label"] ?? rest.placeholder}
    />
  );
}
