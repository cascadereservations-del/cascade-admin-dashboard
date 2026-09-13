import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Colour never carries status alone: every badge has a readable label and a
// leading glyph so state survives greyscale printing.

const TONE = {
  good: 'border-chart-4/40 bg-chart-4/10 text-foreground',
  warn: 'border-champagne/50 bg-cream text-foreground',
  bad: 'border-destructive/40 bg-destructive/10 text-foreground',
  neutral: 'bg-muted text-muted-foreground',
  info: 'border-chart-3/40 bg-chart-3/10 text-foreground',
} as const;

const GLYPH: Record<keyof typeof TONE, string> = { good: '●', warn: '▲', bad: '✕', neutral: '○', info: '◆' };

export type Tone = keyof typeof TONE;

export function StatusBadge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal capitalize', TONE[tone], className)}>
      <span aria-hidden className="text-[9px]">{GLYPH[tone]}</span>
      {children}
    </Badge>
  );
}

export function bookingTone(state: string): Tone {
  switch (state) {
    case 'confirmed':
      return 'good';
    case 'completed':
      return 'neutral';
    case 'inquiry':
      return 'warn';
    case 'cancelled':
      return 'bad';
    default:
      return 'info';
  }
}

export function payoutTone(state: string): Tone {
  switch (state) {
    case 'recorded':
      return 'good';
    case 'expected':
      return 'warn';
    case 'not_applicable':
      return 'neutral';
    default:
      return 'info';
  }
}
