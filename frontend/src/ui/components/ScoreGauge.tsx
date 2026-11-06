/** Semicircle score gauge (ui_spec §6): the 300-900 scale with the policy's
 * auto-reject and auto-approve thresholds marked on the arc and the score in
 * the centre. The arc position is presentation only; the decision is the
 * backend's. */

import type { JSX } from 'react';

import styles from './ScoreGauge.module.css';

export interface ScoreGaugeProps {
  score: number;
  autoRejectBelow: number | null;
  autoApproveMin: number | null;
}

const MIN = 300;
const MAX = 900;
const CX = 100;
const CY = 100;
const RADIUS = 80;

function fraction(score: number): number {
  return Math.min(1, Math.max(0, (score - MIN) / (MAX - MIN)));
}

function point(score: number, radius: number): { x: number; y: number } {
  const angle = Math.PI * fraction(score);
  return { x: CX - radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

function Tick({ score, label }: { score: number; label: string }): JSX.Element {
  const inner = point(score, RADIUS - 12);
  const outer = point(score, RADIUS + 12);
  return (
    <line className={styles.tick} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}>
      <title>{`${label} ${score}`}</title>
    </line>
  );
}

function Caption({ autoRejectBelow, autoApproveMin }: Omit<ScoreGaugeProps, 'score'>): JSX.Element {
  const parts: string[] = [];
  if (autoRejectBelow !== null) parts.push(`Reject below ${autoRejectBelow}`);
  if (autoApproveMin !== null) parts.push(`Approve from ${autoApproveMin}`);
  return <figcaption className={styles.caption}>{parts.join(' · ')}</figcaption>;
}

export function ScoreGauge({ score, autoRejectBelow, autoApproveMin }: ScoreGaugeProps): JSX.Element {
  const end = point(score, RADIUS);
  const track = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`;
  const value = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;
  return (
    <figure className={styles.gauge}>
      <svg viewBox="0 0 200 118" role="img" aria-label={`Credit score ${score} on a 300 to 900 scale`}>
        <path className={styles.track} d={track} />
        <path className={styles.value} d={value} />
        {autoRejectBelow !== null ? <Tick score={autoRejectBelow} label="Auto-reject below" /> : null}
        {autoApproveMin !== null ? <Tick score={autoApproveMin} label="Auto-approve from" /> : null}
        <text className={styles.figure} x={CX} y={CY - 8} textAnchor="middle">
          {score}
        </text>
      </svg>
      <Caption autoRejectBelow={autoRejectBelow} autoApproveMin={autoApproveMin} />
    </figure>
  );
}
