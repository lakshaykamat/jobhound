import { motion } from 'motion/react';
import {
  Database,
  Lock,
  Repeat,
  SlidersHorizontal,
  Zap,
  ShieldCheck,
  CircleDot,
} from 'lucide-react';
import { SectionHeading } from '@/components/section-heading';
import { cn } from '@/lib/utils';

export function FeaturesBento() {
  return (
    <section id="features" className="relative py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="What you get"
          title={
            <>
              Built for people who{' '}
              <span className="italic font-serif text-muted-foreground">
                don’t want to think about it.
              </span>
            </>
          }
          subtitle="Six small promises that add up to a job hunt you can step away from for a week without regret."
        />

        <div className="mt-16 grid grid-cols-12 grid-rows-[auto_auto] gap-3">
          {/* Tile 1 — Live event feed (wide, hero of bento) */}
          <BentoTile className="col-span-12 lg:col-span-7 row-span-1 p-6 pb-0 overflow-hidden">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-sm">
                <TileEyebrow icon={Zap}>Nothing hidden</TileEyebrow>
                <h3 className="text-[22px] font-medium tracking-tight mt-2">
                  Watch it work in real time.
                </h3>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed mt-2">
                  Every search, every match, every skipped duplicate streams to
                  the dashboard as it happens. No black box.
                </p>
              </div>
              <div className="hidden sm:block shrink-0">
                <PulsingDot />
              </div>
            </div>

            <div className="mt-6 -mb-1 mx-[-1.5rem] rounded-t-lg overflow-hidden border-t border-x border-foreground/8 bg-background/40">
              <div className="flex items-center gap-2 px-4 h-9 border-b border-foreground/8 bg-foreground/[0.02]">
                <span className="size-2 rounded-full bg-foreground/15" />
                <span className="size-2 rounded-full bg-foreground/15" />
                <span className="size-2 rounded-full bg-foreground/15" />
                <span className="ml-2 text-[10.5px] font-mono text-muted-foreground/70">
                  Activity
                </span>
                <span className="ml-auto text-[10px] font-mono text-emerald-400/80 inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  live
                </span>
              </div>
              <ul className="px-4 py-3 text-[12px] font-mono leading-[1.85] space-y-0">
                <FeedLine ts="11:26:02" kind="search" msg='searching “backend engineer · remote · india”' />
                <FeedLine ts="11:26:05" kind="found"  msg="11 postings · 9 already seen · 2 new" />
                <FeedLine ts="11:26:07" kind="skip"   msg="skipped — Acme · Backend (saw it yesterday)" />
                <FeedLine ts="11:26:11" kind="score"  msg="Stripe · Senior Backend · fit " highlight="87" />
                <FeedLine ts="11:26:14" kind="finish" msg="done · 2 new roles added · sleeping for 6h" />
              </ul>
            </div>
          </BentoTile>

          {/* Tile 2 — Resume-aware scoring */}
          <BentoTile className="col-span-12 sm:col-span-6 lg:col-span-5 p-6">
            <TileEyebrow icon={SlidersHorizontal}>Scored against you</TileEyebrow>
            <h3 className="text-[20px] font-medium tracking-tight mt-2 mb-1">
              It reads your resume first.
            </h3>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              Your skills, seniority, target roles, and where you’ll work — every
              posting is judged against that, not a generic keyword bag.
            </p>

            <div className="mt-5 rounded-lg border border-foreground/8 bg-foreground/[0.025] p-3.5 font-mono text-[11.5px] leading-relaxed">
              <div><span className="text-muted-foreground">seniority</span> <span className="text-foreground">senior</span></div>
              <div><span className="text-muted-foreground">skills</span> <span className="text-foreground">typescript · node · postgres</span></div>
              <div><span className="text-muted-foreground">roles</span> <span className="text-foreground">backend · platform</span></div>
              <div><span className="text-muted-foreground">where</span> <span className="text-foreground">remote · bengaluru</span></div>
            </div>
          </BentoTile>

          {/* Tile 3 — Write-once */}
          <BentoTile className="col-span-12 sm:col-span-6 lg:col-span-4 p-6">
            <TileEyebrow icon={Lock}>Your list, your call</TileEyebrow>
            <h3 className="text-[20px] font-medium tracking-tight mt-2 mb-1">
              It adds. You decide the rest.
            </h3>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              Jobhound only ever adds new postings. Once a role is on your list,
              it’s yours — mark it applied, archive it, ignore it. Nothing
              overwrites your notes.
            </p>

            <div className="mt-5 flex items-center gap-2 text-[11.5px] font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-foreground/[0.06] border border-foreground/10">
                Add
              </kbd>
              <span className="text-emerald-400/90">yes</span>
              <span className="text-muted-foreground/50">·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-foreground/[0.06] border border-foreground/10">
                Edit yours
              </kbd>
              <span className="text-muted-foreground line-through">never</span>
            </div>
          </BentoTile>

          {/* Tile 4 — Local-first */}
          <BentoTile className="col-span-12 sm:col-span-6 lg:col-span-4 p-6">
            <TileEyebrow icon={Database}>Yours to keep</TileEyebrow>
            <h3 className="text-[20px] font-medium tracking-tight mt-2 mb-1">
              Your data stays with you.
            </h3>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              Your resume, your shortlist, your search history — all of it sits
              in one folder on your machine. No cloud account, no signup, no
              third party gets a copy.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-1.5 text-[11px] font-mono">
              {['Your jobs', 'Your runs', 'Your spend'].map((f) => (
                <span
                  key={f}
                  className="px-2 py-1 rounded bg-foreground/[0.04] border border-foreground/8 text-muted-foreground text-center truncate"
                >
                  {f}
                </span>
              ))}
            </div>
          </BentoTile>

          {/* Tile 5 — Cap-aware */}
          <BentoTile className="col-span-12 lg:col-span-4 p-6">
            <TileEyebrow icon={ShieldCheck}>Set a budget. It sticks.</TileEyebrow>
            <h3 className="text-[20px] font-medium tracking-tight mt-2 mb-1">
              Won’t surprise your card.
            </h3>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              You set a monthly cap on searches. The moment Jobhound hits it,
              it stops — full stop. No runaway bill while you sleep.
            </p>
            <div className="mt-5 h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
              <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-brand to-brand/60 relative">
                <span className="absolute -top-1 -bottom-1 right-0 w-px bg-brand" />
              </div>
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] font-mono text-muted-foreground/80">
              <span>62 of 100 used</span>
              <span>sample</span>
            </div>
          </BentoTile>

          {/* Tile 6 — Re-reads config (full width closer) */}
          <BentoTile className="col-span-12 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="max-w-xl">
                <TileEyebrow icon={Repeat}>Change your mind</TileEyebrow>
                <h3 className="text-[22px] sm:text-[26px] font-medium tracking-tight mt-2 mb-1.5">
                  Tweak it any time. No restart.
                </h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  Update your resume, add a new role, raise the bar on what
                  counts as a match — Jobhound picks it up on the next run.
                  No buttons to push, nothing to redeploy.
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="hidden sm:flex flex-col items-end gap-1 text-right">
                  <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80">
                    Re-reads
                  </span>
                  <span className="text-[28px] font-medium tracking-tight tabular-nums">
                    every run
                  </span>
                </div>
                <div className="hidden sm:flex shrink-0 items-center justify-center size-20 rounded-xl bg-foreground/[0.03] ring-1 ring-inset ring-foreground/10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  >
                    <Repeat className="size-7 text-foreground/60" strokeWidth={1.5} />
                  </motion.div>
                </div>
              </div>
            </div>
          </BentoTile>
        </div>
      </div>
    </section>
  );
}

function BentoTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'rounded-xl border bg-card/50 backdrop-blur-sm relative overflow-hidden',
        'hover:border-foreground/15 transition-colors',
        'before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_top,oklch(1_0_0/0.03),transparent_45%)]',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function TileEyebrow({
  icon: Icon,
  children,
}: {
  icon: typeof Database;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
      <Icon className="size-3.5" strokeWidth={1.8} />
      {children}
    </div>
  );
}

function PulsingDot() {
  return (
    <div className="relative grid place-items-center size-12 rounded-full bg-brand/10 ring-1 ring-inset ring-brand/30">
      <span className="absolute inset-0 rounded-full animate-ping bg-brand/15" />
      <CircleDot className="size-5 text-brand" />
    </div>
  );
}

function FeedLine({
  ts,
  kind,
  msg,
  highlight,
}: {
  ts: string;
  kind: 'search' | 'found' | 'skip' | 'score' | 'finish';
  msg: string;
  highlight?: string;
}) {
  const tone = {
    search: 'text-foreground/70',
    found: 'text-amber-300/90',
    skip: 'text-muted-foreground/60',
    score: 'text-emerald-300/90',
    finish: 'text-brand',
  }[kind];
  return (
    <li className="grid grid-cols-[64px_72px_1fr] gap-3">
      <span className="text-muted-foreground/50">{ts}</span>
      <span className={cn('font-medium', tone)}>{kind}</span>
      <span className="text-foreground/80 truncate">
        {msg}
        {highlight && (
          <span className="text-brand font-medium">{highlight}</span>
        )}
      </span>
    </li>
  );
}
