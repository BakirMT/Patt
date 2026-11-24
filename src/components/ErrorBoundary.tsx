import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed.error === 'string') {
        message = parsed.error;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application error caught by ErrorBoundary:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#0D1424] border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-100">
                Something went wrong
              </h1>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
