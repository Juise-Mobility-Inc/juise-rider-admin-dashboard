import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

// Without this, an uncaught render error unmounts the whole tree and leaves
// a silent blank white page — no banner, no console-visible cause to the
// user, just nothing. This turns that into a recoverable screen instead.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in dashboard UI:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="login-shell">
          <div className="login-center-card">
            <p className="login-brand-title">Juise Rider Admin Dashboard</p>
            <div className="login-form-header">
              <h2>Something went wrong</h2>
              <p className="mfa-help">
                This screen hit an unexpected error and couldn't finish
                loading. Reloading usually fixes it.
              </p>
            </div>
            <p className="error-text">{this.state.error.message}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type ScreenProps = {
  children: ReactNode;
  // Changing this (e.g. the current section) clears a caught error, so
  // navigating away from a broken screen and back retries it.
  resetKey: string;
};

// Wraps just the active screen: a crash in one screen shows this in the
// workspace while the sidebar and header keep working, instead of the whole
// app being replaced by the root boundary above.
export class ScreenErrorBoundary extends Component<ScreenProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in dashboard screen:", error, info.componentStack);
  }

  componentDidUpdate(previous: ScreenProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel screen-error" role="alert">
          <h2>This page hit an error</h2>
          <p className="muted-text">
            The rest of the dashboard still works. Try again, or reload the
            page if it keeps happening.
          </p>
          <p className="error-text">{this.state.error.message}</p>
          <div className="screen-error-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
