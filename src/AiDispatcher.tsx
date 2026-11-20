import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { RecoveryCandidate, SimulationResult } from './types';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; id: string; text: string } | { kind: 'fallback'; id: string; text: string };

export function AiDispatcher({ result, recoveries }: { result: SimulationResult | null; recoveries: RecoveryCandidate[] | null }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const ready = !!result && !!recoveries && recoveries.length > 0;

  async function ask() {
    if (!result || !recoveries) return;
    const best = recoveries[0];
    const fallback: Status = { kind: 'fallback', id: best.action.id, text: best.explanation };
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch('/.netlify/functions/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseline: { stranded: result.metrics.strandedPassengers, totalDelayMinutes: result.metrics.totalDelayMinutes, delayedFlights: result.metrics.delayedFlights },
          candidates: recoveries.slice(0, 5).map((c) => ({
            id: c.action.id, label: c.action.label, passengersSaved: c.passengersSaved, delayMinutesSaved: c.delayMinutesSaved,
            afterStranded: c.result.metrics.strandedPassengers, afterTotalDelayMinutes: c.result.metrics.totalDelayMinutes,
          })),
        }),
      });
      const data = await res.json();
      setStatus(data.ok ? { kind: 'ok', id: data.recommendedId, text: data.explanation } : fallback);
    } catch {
      setStatus(fallback);
    }
  }

  const label = (id: string) => recoveries?.find((c) => c.action.id === id)?.action.label ?? id;
  return (
    <section className="gemini-note" aria-live="polite">
      <div className="gemini-icon"><Sparkles size={17} /></div>
      <div>
        <strong>AI DISPATCHER</strong>
        {status.kind === 'idle' && <p>Run a disruption and recommend recovery, then ask the AI dispatcher to pick and explain the best action. Every number it states is checked against the engine.</p>}
        {status.kind === 'loading' && <p>Dispatcher is reviewing the engine's candidates…</p>}
        {(status.kind === 'ok' || status.kind === 'fallback') && <p><b>Recommended: {label(status.id)}.</b> {status.text}</p>}
      </div>
      <div>
        {status.kind === 'ok' && <span className="hook-status">NUMBERS VERIFIED AGAINST ENGINE</span>}
        {status.kind === 'fallback' && <span className="hook-status">ENGINE-GENERATED EXPLANATION</span>}
        <button className="recovery-button" disabled={!ready || status.kind === 'loading'} onClick={ask}>Ask AI Dispatcher</button>
      </div>
    </section>
  );
}
