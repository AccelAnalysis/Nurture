import { Component, type PropsWithChildren } from 'react';
export class ErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="public-main" id="main-content">
          <h1>Something interrupted this experience.</h1>
          <p>Your last action may not have completed. Return to the public page to try again.</p>
          <a className="button primary" href="/">
            Return to Nurture
          </a>
        </main>
      );
    return this.props.children;
  }
}
