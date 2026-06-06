import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Check, Copy, Github, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const command = `git clone git@github.com:lakshaykamat/jobhound.git && cd jobhound && pnpm install && pnpm start`;

const commandLines = [
  { cmd: 'git',  rest: 'clone git@github.com:lakshaykamat/jobhound.git' },
  { cmd: 'cd',   rest: 'jobhound && pnpm install' },
  { cmd: 'pnpm', rest: 'start' },
];

export function CtaSection() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-5xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl border border-foreground/10 bg-card/60 backdrop-blur-xl overflow-hidden p-8 sm:p-14"
        >
          {/* halo */}
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.18_38/0.14),transparent_55%),radial-gradient(ellipse_at_bottom,oklch(0.6_0.15_250/0.10),transparent_60%)]" />
          <div className="absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-40" />

          <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
            <Badge variant="brand" className="font-mono uppercase tracking-[0.18em] !text-[10.5px]">
              Get started
            </Badge>
            <h2 className="mt-5 font-medium tracking-[-0.035em] leading-[1] text-[clamp(2.2rem,5vw,3.8rem)]">
              Three commands.
              <br />
              <span className="italic font-serif text-muted-foreground">Then go to lunch.</span>
            </h2>
            <p className="mt-5 text-[16px] text-muted-foreground leading-relaxed">
              The server boots paused. Open the dashboard, click Start, and ignore
              it for the next six hours.
            </p>
          </div>

          {/* terminal */}
          <div className="mt-10 mx-auto max-w-2xl rounded-xl border border-foreground/10 bg-background/80 backdrop-blur overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2 px-3.5 h-9 border-b border-foreground/8 bg-foreground/[0.03]">
              <Terminal className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-mono text-muted-foreground">~/code</span>
              <button
                onClick={copy}
                className={cn(
                  'ml-auto flex items-center gap-1.5 h-6 px-2 rounded text-[10.5px] font-mono transition-colors',
                  copied
                    ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30'
                    : 'bg-foreground/[0.04] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]',
                )}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <div className="px-5 py-4 font-mono text-[12.5px] leading-[1.95]">
              {commandLines.map((l, i) => (
                <div key={i} className="flex">
                  <span className="text-muted-foreground/40 select-none w-6 shrink-0">
                    {i + 1}
                  </span>
                  <span>
                    <span className="text-brand">{l.cmd}</span>{' '}
                    <span className="text-foreground/85">{l.rest}</span>
                  </span>
                </div>
              ))}
              <div className="flex pt-1.5">
                <span className="text-muted-foreground/40 select-none w-6 shrink-0">
                  ›
                </span>
                <span className="text-emerald-400/85">
                  http server listening on :8787
                </span>
              </div>
              <div className="flex">
                <span className="text-muted-foreground/40 select-none w-6 shrink-0" />
                <span className="text-muted-foreground/60">
                  state=paused — open the UI to begin
                  <span className="animate-caret">▌</span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              variant="brand"
              className="rounded-full h-11 px-6 text-[13.5px] gap-2"
            >
              <a
                href="https://github.com/lakshaykamat/jobhound"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
                Get it on GitHub
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full h-11 px-6 text-[13.5px] bg-card/40"
            >
              <a
                href="https://github.com/lakshaykamat/jobhound/blob/main/docs/deploy.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Deployment notes
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
