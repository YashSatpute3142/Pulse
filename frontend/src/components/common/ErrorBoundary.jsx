import { Component } from 'react';
import { ErrorState } from './ErrorState.jsx';

export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { if (import.meta.env.DEV) console.error(error); }
  render() {
    if (this.state.failed) {
      return <ErrorState title="This part of Pulse crashed" message="Reload to try again." onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
