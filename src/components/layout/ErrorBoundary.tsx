import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: React.ReactNode; label: string; fallback?: React.ReactNode }
interface State { error: Error | null }

/**
 * One widget failing must never take a screen down with it. A 3D globe that cannot
 * start is a degraded panel, not a blank console — during a pass the rest of the
 * screen is what the operator needs.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}] failed to render:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-start gap-2 rounded border border-[#E8943A]/40 bg-[#E8943A]/[0.07] p-4">
        <span className="flex items-center gap-2 text-[13px] font-bold text-[#E8943A]">
          <AlertTriangle size={16} /> {this.props.label} unavailable
        </span>
        <p className="text-[12.5px] text-[#A1A7B3]">
          This panel failed to start. Everything else on the screen is still live.
        </p>
        <button onClick={() => this.setState({ error: null })}
          className="text-[12.5px] text-[#3CB992] hover:underline">
          Try again
        </button>
      </div>
    );
  }
}
