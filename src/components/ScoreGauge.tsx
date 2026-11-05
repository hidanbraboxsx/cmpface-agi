import { useEffect, useState } from 'react';

export function ScoreGauge({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1000, score));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 2600);
      setShown(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  const angle = Math.PI * (1 - shown / 1000);
  const x = 150 + 120 * Math.cos(angle);
  const y = 145 - 120 * Math.sin(angle);
  const reveal = score > 0 ? shown / Math.max(1, Math.min(1000, score)) : 1;
  const arcOffset = (from: number, to: number) => 100 * (1 - Math.max(0, Math.min(1, (reveal * 100 - from) / (to - from))));
  const segment = (from: number, to: number) => {
    const point = (value: number) => {
      const radians = Math.PI * (1 - value / 100);
      return `${150 + 120 * Math.cos(radians)} ${145 - 120 * Math.sin(radians)}`;
    };
    return `M ${point(from)} A 120 120 0 0 1 ${point(to)}`;
  };
  return (
    <div className="mx-auto w-full max-w-80" role="meter" aria-label="Score ilustrativo" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={score}>
      <svg viewBox="0 0 300 190" className="w-full overflow-visible" aria-hidden="true">
        <path d="M 30 145 A 120 120 0 0 1 270 145" pathLength="100" fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-muted" />
        <path d={segment(0, 25)} pathLength="100" strokeDasharray="100" strokeDashoffset={arcOffset(0, 25)} fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-destructive" />
        <path d={segment(30, 70)} pathLength="100" strokeDasharray="100" strokeDashoffset={arcOffset(30, 70)} fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-warning" />
        <path d={segment(75, 100)} pathLength="100" strokeDasharray="100" strokeDashoffset={arcOffset(75, 100)} fill="none" strokeWidth="16" strokeLinecap="round" className="stroke-success" />
        <circle cx={x} cy={y} r="17" className="fill-primary/15 animate-score-halo" />
        <circle cx={x} cy={y} r="10" strokeWidth="4" className="fill-foreground stroke-card" />
        <text x="150" y="127" textAnchor="middle" className="fill-foreground font-display text-5xl font-bold">{shown}</text>
        <text x="150" y="151" textAnchor="middle" className="fill-muted-foreground text-sm">de 1.000 · simulação</text>
        <text x="25" y="180" className="fill-muted-foreground text-xs">0</text>
        <text x="275" y="180" textAnchor="end" className="fill-muted-foreground text-xs">1.000</text>
      </svg>
    </div>
  );
}