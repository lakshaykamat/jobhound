import { motion } from 'motion/react';
import {
  Play,
  Pause,
  RotateCw,
  CircleDot,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Row = {
  company: string;
  title: string;
  via: string;
  fit: number;
  posted: string;
  tag?: 'NEW' | 'FILTERED';
};

const rows: Row[] = [
  { company: 'Stripe',         title: 'Senior Backend Engineer',         via: 'linkedin', fit: 87, posted: '2h',  tag: 'NEW' },
  { company: 'Hugging Face',   title: 'ML Platform Engineer',            via: 'company',  fit: 79, posted: '4h',  tag: 'NEW' },
  { company: 'Vercel',         title: 'Distributed Systems',             via: 'company',  fit: 74, posted: '6h',  tag: 'NEW' },
  { company: 'Ramp',           title: 'Software Engineer, Payments',     via: 'linkedin', fit: 68, posted: '11h', tag: 'FILTERED' },
  { company: 'Anthropic',      title: 'Forward Deployed Engineer',       via: 'company',  fit: 91, posted: '1d',  tag: 'NEW' },
];

export function DashboardPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      className="relative w-full"
    >
      {/* gradient halo */}
      <div className="absolute -inset-x-12 -top-10 -bottom-12 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.18_38/0.16),transparent_55%),radial-gradient(ellipse_at_bottom,oklch(0.6_0.15_250/0.10),transparent_60%)] blur-2xl" />

      <div className="rounded-2xl border border-foreground/10 bg-card/80 backdrop-blur-xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.06)] overflow-hidden">
        {/* chrome */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-foreground/8 bg-background/40">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1.5 px-3 h-6 rounded-full bg-foreground/[0.04] ring-1 ring-inset ring-foreground/8 text-[11px] text-muted-foreground font-mono">
              <CircleDot className="size-2.5 text-emerald-400" />
              localhost:8787
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/70">
            jobhound · v0.1.0
          </span>
        </div>

        {/* body */}
        <div className="grid grid-cols-12 gap-px bg-foreground/8">
          {/* sidebar */}
          <aside className="col-span-3 bg-card p-3 hidden sm:flex flex-col gap-1">
            <div className="px-2 pt-1 pb-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
              Server
            </div>
            <NavItem icon={<Play className="size-3.5" />} label="Cycles" active />
            <NavItem icon={<Sparkles className="size-3.5" />} label="Jobs" badge="12" />
            <NavItem icon={<RotateCw className="size-3.5" />} label="Runs" />
            <div className="mt-4 px-2 pt-1 pb-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
              Config
            </div>
            <NavItem icon={<ChevronRight className="size-3.5" />} label="Queries" badge="4" />
            <NavItem icon={<ChevronRight className="size-3.5" />} label="Fit profile" />
            <NavItem icon={<ChevronRight className="size-3.5" />} label="Caps" />

            <div className="mt-auto p-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/8">
              <div className="flex items-center gap-2 mb-2">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium">Running</span>
              </div>
              <div className="text-[10.5px] font-mono text-muted-foreground leading-relaxed">
                next cycle in <span className="text-foreground">3h 41m</span>
              </div>
            </div>
          </aside>

          {/* main */}
          <main className="col-span-12 sm:col-span-9 bg-card">
            {/* header strip */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-foreground/8">
              <div>
                <div className="text-[13px] font-medium">Recent cycle</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  finished 2 min ago · scored 7 · wrote 5 rows
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ChromeBtn>
                  <RotateCw className="size-3.5" />
                  <span className="hidden sm:inline">Run once</span>
                  <span className="sm:hidden">Run</span>
                </ChromeBtn>
                <ChromeBtn intent="brand">
                  <Pause className="size-3.5" /> Pause
                </ChromeBtn>
              </div>
            </div>

            {/* meter strip */}
            <div className="grid grid-cols-3 gap-px bg-foreground/8 border-b border-foreground/8">
              <Meter label="SerpApi" value="62" cap="/ 100" hue="brand" pct={62} />
              <Meter label="Tokens" value="18.4k" cap="this mo." hue="muted" pct={32} />
              <Meter label="Cost" value="$0.41" cap="USD" hue="emerald" pct={18} />
            </div>

            {/* table */}
            <div className="px-1.5 pt-1.5">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] sm:grid-cols-[1.2fr_2fr_0.6fr_0.5fr_0.4fr] gap-3 px-3.5 py-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
                <span>Company</span>
                <span>Title</span>
                <span className="hidden sm:block">Via</span>
                <span className="text-right">Fit</span>
                <span className="text-right hidden sm:block">Posted</span>
              </div>
              <div className="flex flex-col">
                {rows.map((r, i) => (
                  <motion.div
                    key={r.company + r.title}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.9 + i * 0.06, duration: 0.4 }}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] sm:grid-cols-[1.2fr_2fr_0.6fr_0.5fr_0.4fr] gap-3 px-3.5 py-2.5 items-center rounded-md hover:bg-foreground/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="hidden sm:grid size-5 rounded bg-foreground/8 ring-1 ring-inset ring-foreground/10 place-items-center text-[10px] font-semibold tracking-tight shrink-0">
                        {r.company[0]}
                      </span>
                      <span className="truncate text-[12.5px] font-medium">
                        {r.company}
                      </span>
                      {r.tag === 'NEW' && (
                        <span className="hidden sm:inline text-[9.5px] font-mono px-1.5 py-px rounded bg-brand/15 text-brand ring-1 ring-inset ring-brand/30 shrink-0">
                          NEW
                        </span>
                      )}
                      {r.tag === 'FILTERED' && (
                        <span className="hidden sm:inline text-[9.5px] font-mono px-1.5 py-px rounded bg-foreground/8 text-muted-foreground shrink-0">
                          FILTERED
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12.5px] text-foreground/85">
                      {r.title}
                    </div>
                    <div className="hidden sm:block text-[11.5px] font-mono text-muted-foreground">
                      {r.via}
                    </div>
                    <div className="text-right shrink-0">
                      <FitBadge value={r.fit} />
                    </div>
                    <div className="hidden sm:block text-right text-[11.5px] font-mono text-muted-foreground">
                      {r.posted}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* footer event line */}
            <div className="flex items-center gap-2 px-5 py-2.5 mt-1.5 border-t border-foreground/8 text-[11px] font-mono text-muted-foreground bg-foreground/[0.02] overflow-hidden">
              <span className="size-1.5 rounded-full bg-brand animate-pulse shrink-0" />
              <span className="text-foreground/80 shrink-0">cycle:finish</span>
              <span className="text-muted-foreground/60 shrink-0 hidden sm:inline">·</span>
              <span className="truncate min-w-0">serpapi=2 tokens=1,204 usd=$0.041 +2 rows</span>
              <span className="ml-auto text-muted-foreground/50 shrink-0 hidden md:inline">.data/cycles.jsonl</span>
            </div>
          </main>
        </div>
      </div>
    </motion.div>
  );
}

function NavItem({
  icon,
  label,
  badge,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        'flex items-center gap-2 px-2 h-7 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
        active && 'bg-foreground/[0.05] text-foreground',
      )}
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] font-mono text-muted-foreground/70">{badge}</span>
      )}
    </button>
  );
}

function ChromeBtn({
  children,
  intent,
}: {
  children: React.ReactNode;
  intent?: 'brand';
}) {
  return (
    <button
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium border transition-colors whitespace-nowrap shrink-0',
        intent === 'brand'
          ? 'bg-brand/15 text-brand border-brand/25 hover:bg-brand/20'
          : 'bg-foreground/[0.03] text-foreground/80 border-foreground/10 hover:bg-foreground/[0.06]',
      )}
    >
      {children}
    </button>
  );
}

function Meter({
  label,
  value,
  cap,
  hue,
  pct,
}: {
  label: string;
  value: string;
  cap: string;
  hue: 'brand' | 'muted' | 'emerald';
  pct: number;
}) {
  const barColor =
    hue === 'brand'
      ? 'bg-brand'
      : hue === 'emerald'
        ? 'bg-emerald-400/80'
        : 'bg-foreground/40';
  return (
    <div className="bg-card px-3 sm:px-4 py-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/80 truncate">
          {label}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
          {cap}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] sm:text-[22px] font-medium tracking-tight tabular-nums">
          {value}
        </span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.1, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
          className={cn('h-full rounded-full', barColor)}
        />
      </div>
    </div>
  );
}

function FitBadge({ value }: { value: number }) {
  const isHot = value >= 85;
  const isWarm = value >= 70 && value < 85;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 px-1.5 py-0.5 rounded text-[11.5px] font-mono tabular-nums',
        isHot
          ? 'bg-brand/15 text-brand ring-1 ring-inset ring-brand/30'
          : isWarm
            ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25'
            : 'bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-foreground/10',
      )}
    >
      {value}
      {isHot && <ArrowUpRight className="size-3 -mr-0.5" />}
    </span>
  );
}
