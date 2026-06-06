import { motion } from 'motion/react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardPreview } from '@/components/dashboard-preview';

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-x-clip">
      {/* layered backgrounds */}
      <div className="absolute inset-0 -z-10 bg-page" />
      <div className="absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-60" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[1200px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.18_38/0.22),transparent_65%)]" />

      <div className="mx-auto max-w-6xl px-5">
        {/* eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center"
        >
          <a
            href="https://github.com/lakshaykamat/jobhound"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border bg-card/40 backdrop-blur px-3 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            <Badge variant="brand" className="!py-0 !px-1.5 !text-[10px]">
              <Sparkles className="size-2.5" />
              v0.1.0
            </Badge>
            <span>Pause-by-default · free &amp; open source</span>
            <ArrowUpRight className="size-3 opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </motion.div>

        {/* headline */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          className="mt-8 text-center font-medium tracking-[-0.04em] leading-[0.95] text-[clamp(2.6rem,7vw,5.5rem)]"
        >
          <span className="text-gradient-brand">The job hunt,</span>
          <br />
          <span className="text-foreground/95">on quiet autopilot.</span>
        </motion.h1>

        {/* lede */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-center text-[17px] leading-relaxed text-muted-foreground"
        >
          Jobhound pulls postings from Google Jobs, scores them against your resume,
          and drops the worthwhile ones into a Google Sheet. Local-first, cap-aware,
          and{' '}
          <span className="font-mono text-foreground/85">paused</span> until you say
          go.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.32 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Button
            asChild
            size="lg"
            variant="brand"
            className="rounded-full h-11 px-6 text-[13.5px] relative isolate"
          >
            <a
              href="https://github.com/lakshaykamat/jobhound"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="absolute inset-0 -z-10 rounded-full animate-ring-pulse" />
              Get it on GitHub
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full h-11 px-6 text-[13.5px] bg-card/50 backdrop-blur"
          >
            <a href="#how-it-works">
              See how it works
            </a>
          </Button>
        </motion.div>

        {/* trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11.5px] text-muted-foreground/80 font-mono"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            122 tests passing
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span>MIT · single-operator</span>
          <span className="text-muted-foreground/30">·</span>
          <span>Node 22 + Docker</span>
        </motion.div>

        {/* dashboard preview */}
        <div className="mt-20 sm:mt-24">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
