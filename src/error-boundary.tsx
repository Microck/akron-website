import { Component } from "react";
import type { ReactNode } from "react";

// React 19's onCaughtError at the root reports the exception once. The boundary
// only supplies a fallback; it must not capture the same exception a second time.
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed ? (
      <main className="install-redirect-shell" role="alert">
        <div>
          <h1>This page could not load.</h1>
          <a className="install-button" href={window.location.pathname}>Reload page</a>
        </div>
      </main>
    ) : this.props.children;
  }
}
