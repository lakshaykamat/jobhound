import { Search, Filter, Gauge, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';
import { SectionHeading } from '@/components/section-heading';

const steps = [
  {
    n: '01',
    title: 'Tell it about you',
    body: 'Drop in your resume and a few search terms — roles you want, places you’d work, what counts as a dealbreaker.',
    icon: Search,
    mono: 'Once. Edit any time.',
  },
  {
    n: '02',
    title: 'It searches, quietly',
    body: 'Every few hours it sweeps Google Jobs for fresh postings. Anything it already showed you is skipped — no repeats.',
    icon: Filter,
    mono: 'Runs while you’re asleep',
  },
  {
    n: '03',
    title: 'It ranks the fit',
    body: 'Each new posting is read against your resume and scored 0–100. You see why it scored that way in one line.',
    icon: Gauge,
    mono: '0 – 100 fit score',
  },
  {
    n: '04',
    title: 'You decide',
    body: 'The shortlist lands in your dashboard. Apply, archive, ignore — your list, your call. Jobhound never edits it after.',
    icon: FileSpreadsheet,
    mono: 'Your shortlist is yours',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28">
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Four steps. Then it{' '}
              <span className="italic font-serif text-muted-foreground">goes quiet.</span>
            </>
          }
          subtitle="Set it up once. It checks for new roles in the background, ranks them against you, and only surfaces the ones worth your time."
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 }}
              className="group relative rounded-xl border bg-card/40 backdrop-blur p-5 hover:border-foreground/15 transition-colors overflow-hidden"
            >
              {/* sublime corner gradient on hover */}
              <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_left,oklch(0.74_0.18_38/0.08),transparent_55%)]" />

              <div className="flex items-center justify-between mb-12">
                <span className="text-[10.5px] font-mono tracking-[0.2em] text-muted-foreground/70">
                  STEP {s.n}
                </span>
                <span className="inline-grid place-items-center size-8 rounded-md bg-foreground/[0.04] ring-1 ring-inset ring-foreground/8">
                  <s.icon className="size-4 text-foreground/80" strokeWidth={1.6} />
                </span>
              </div>
              <h3 className="text-[18px] font-medium tracking-tight mb-2">
                {s.title}
              </h3>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-4">
                {s.body}
              </p>
              <div className="text-[10.5px] font-mono text-muted-foreground/60 truncate">
                {s.mono}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
