import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MAJAL UI ERROR]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div dir="rtl" className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-400/20 max-w-xl w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-rose-300 flex items-center justify-center mx-auto"><AlertTriangle className="w-7 h-7" /></div>
          <h2 className="text-xl font-black mt-5">تعذر عرض هذا الجزء بأمان</h2>
          <p className="text-sm text-stone-400 mt-3 leading-7">حافظت مجال على بقية الجلسة ولم تنفذ أي عملية إضافية. يمكنك إعادة تحميل الواجهة والمحاولة مرة أخرى.</p>
          {this.state.message && <div className="mt-4 p-3 rounded-xl bg-slate-950/50 border border-white/10 text-[11px] text-stone-500 font-mono break-all">{this.state.message}</div>}
          <button onClick={() => window.location.reload()} className="mt-5 px-5 py-3 rounded-xl bg-[#c7a55b] text-stone-950 text-xs font-black inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" /> إعادة تحميل مجال</button>
        </div>
      </div>
    );
  }
}
