import { motion, useInView, useMotionValue, useTransform, animate } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Search, Coins, Banknote, ArrowUpRight } from 'lucide-react';
import { SectionHeading } from '@/components/section-heading';
import { cn } from '@/lib/utils';

const meters = [
  {
    icon: Search,
    eyebrow: 'SerpApi searches',
    cap: '100 / mo free tier',
    value: 62,
    suffix: '',
    pct: 62,
    color: 'brand',
    note: '4 queries × 1 page × 16 cycles',
  },
  {
    icon: Coins,
    eyebrow: 'LLM tokens',
    cap: 'gpt-4o-mini',
    value: 18420,
    suffix: '',
    pct: 32,
    color: 'foreground',
    note: 'Analyze + score, 7 scored, 11 skipped-known',
  },
  {
    icon: Banknote,
    eyebrow: 'USD spent',
    cap: 'model + serpapi',
    value: 0.41,
    prefix: '$',
    decimals: 2,
    suffix: '',
    pct: 18,
    color: 'emerald',
    note: 'Prices hardcoded in src/pricing.ts',
  },
] as const;

export function CostMeters() {
  return (
    <section id="cost" className="relative py-28">
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Cost meters"
          title={
            <>
              You always know{' '}
              <span className="italic font-serif text-muted-foreground">
                what it cost.
              </span>
            </>
          }
          subtitle="Every cycle logs three numbers. The cap is enforced, not a polite suggestion."
        />

        <div className="mt-16 grid gap-3 sm:grid-cols-3">
          {meters.map((m, i) => (
            <MeterCard key={m.eyebrow} {...m} delay={i * 0.08} />
          ))}
        </div>

        {/* row of bonus stats */}
        <div className="mt-3 grid sm:grid-cols-4 gap-3">
          <Stat label="Average cycle" value="14s" />
          <Stat label="Rows written" value="38 / mo" />
          <Stat label="Skipped-known" value="178" />
          <Stat label="Errors" value="0" trend="great" />
        </div>
      </div>
    </section>
  );
}

type MeterProps = (typeof meters)[number] & { delay: number };

function MeterCard({
  icon: Icon,
  eyebrow,
  cap,
  value,
  pct,
  color,
  note,
  prefix,
  decimals,
  delay,
}: MeterProps & { prefix?: string; decimals?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (n) =>
    decimals
      ? n.toFixed(decimals)
      : Math.round(n).toLocaleString('en-US'),
  );

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, {
      duration: 1.4,
      delay: 0.2 + delay,
      ease: [0.16, 1, 0.3, 1],
    });
    return controls.stop;
  }, [inView, value, count, delay]);

  const barColor =
    color === 'brand'
      ? 'bg-brand'
      : color === 'emerald'
        ? 'bg-emerald-400/85'
        : 'bg-foreground/60';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}
      className="group relative rounded-xl border bg-card/50 backdrop-blur-sm p-5 overflow-hidden"
    >
      <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_right,oklch(0.74_0.18_38/0.06),transparent_50%)]" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
          <Icon className="size-3.5" strokeWidth={1.8} />
          {eyebrow}
        </div>
        <span className="text-[10.5px] font-mono text-muted-foreground/60">{cap}</span>
      </div>

      <div className="flex items-baseline gap-1">
        {prefix && (
          <span className="text-[28px] font-medium text-muted-foreground/80 leading-none">
            {prefix}
          </span>
        )}
        <motion.span className="text-[56px] font-medium tracking-[-0.04em] leading-none tabular-nums text-foreground">
          {rounded}
        </motion.span>
      </div>

      <div className="mt-6 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1.2, delay: 0.4 + delay, ease: [0.16, 1, 0.3, 1] }}
          className={cn('h-full rounded-full', barColor)}
        />
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground/85 leading-relaxed">
        {note}
      </p>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: 'great';
}) {
  return (
    <div className="rounded-xl border bg-card/40 backdrop-blur-sm px-4 py-3.5 flex items-center justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-[14px] font-medium tabular-nums">
        {value}
        {trend === 'great' && (
          <ArrowUpRight className="size-3.5 text-emerald-400" />
        )}
      </span>
    </div>
  );
}
