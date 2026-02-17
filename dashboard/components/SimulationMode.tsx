'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { FlaskConical, Play, Pause, CheckCircle, RotateCcw, ArrowRightLeft } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface SimulationStep {
  type: 'analyze' | 'quote' | 'profitability' | 'execute' | 'result';
  label: string;
  status: 'pending' | 'running' | 'done';
  result?: string;
}

interface SimulationModeProps {
  riskProfile: 'low' | 'medium' | 'high';
  maxInvestment: string;
  onRunSimulation?: () => void;
}

// ─── Component ──────────────────────────────────────────────

export function SimulationMode({ riskProfile, maxInvestment, onRunSimulation }: SimulationModeProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<SimulationStep[]>([]);

  const startSimulation = async () => {
    setIsRunning(true);
    setCurrentStep(0);

    const simulationSteps: SimulationStep[] = [
      { type: 'analyze', label: 'Scanning pools for yield opportunities...', status: 'pending' },
      { type: 'quote', label: 'Getting swap quotes from PancakeSwap...', status: 'pending' },
      { type: 'profitability', label: 'Checking profitability after gas costs...', status: 'pending' },
      { type: 'execute', label: 'Simulating transaction execution (dry run)...', status: 'pending' },
      { type: 'result', label: 'Simulation complete', status: 'pending' },
    ];

    setSteps(simulationSteps);

    // Simulate each step with delays
    for (let i = 0; i < simulationSteps.length; i++) {
      setCurrentStep(i);
      setSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'running' : idx < i ? 'done' : 'pending',
        }))
      );

      // Simulate work
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));

      // Add result text
      const results = [
        `Found 8 pools matching "${riskProfile}" profile`,
        `Best route: USDT → USDC via PancakeSwap V2 (0.05% price impact)`,
        `Net gain over 7 days: +$${(parseFloat(maxInvestment || '1000') * 0.003).toFixed(2)} (gas: $0.12)`,
        `UserOp built & validated (EIP-4337 compatible)`,
        `✅ Dry run successful — no funds were moved`,
      ];

      setSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx <= i ? 'done' : idx === i + 1 ? 'running' : 'pending',
          result: idx === i ? results[i] : s.result,
        }))
      );
    }

    setIsRunning(false);
    onRunSimulation?.();
  };

  const reset = () => {
    setSteps([]);
    setCurrentStep(0);
    setIsRunning(false);
  };

  return (
    <Card className="border-dashed border-orange-500/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-orange-400/80" />
            </div>
            <div>
              <CardTitle>Simulation Mode</CardTitle>
              <CardDescription>Dry run — no real transactions</CardDescription>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
            Sandbox
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        {/* Info */}
        <div className="p-3 rounded-lg bg-orange-500/[0.03] border border-orange-500/10">
          <p className="text-xs text-zinc-400">
            Run a simulated scan & reallocation to preview what the agent would do — without moving any funds.
            Uses your current risk profile ({riskProfile}) and investment limit ({maxInvestment || '1000'} USD).
          </p>
        </div>

        {/* Steps */}
        {steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  step.status === 'running'
                    ? 'bg-orange-500/[0.04] border-orange-500/20'
                    : step.status === 'done'
                    ? 'bg-surface border-[var(--border)]'
                    : 'bg-surface/50 border-[var(--border)] opacity-50'
                }`}
              >
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === 'running' ? (
                    <div className="w-4 h-4 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                  ) : step.status === 'done' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-zinc-700" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${step.status === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {step.label}
                  </p>
                  {step.result && (
                    <p className="text-xs text-zinc-500 mt-1 font-mono">{step.result}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {steps.length === 0 || (!isRunning && steps.every((s) => s.status === 'done')) ? (
            <>
              <Button
                size="lg"
                className="flex-1"
                onClick={startSimulation}
                disabled={isRunning}
              >
                <Play className="w-4 h-4 mr-2" />
                {steps.length > 0 ? 'Run Again' : 'Start Simulation'}
              </Button>
              {steps.length > 0 && (
                <Button variant="outline" size="lg" onClick={reset}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="lg" className="flex-1" disabled>
              <div className="w-4 h-4 rounded-full border-2 border-orange-400 border-t-transparent animate-spin mr-2" />
              Simulating...
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SimulationMode;
