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
