import { SectionHeading } from '@/components/section-heading';
import { cn } from '@/lib/utils';

const rows = [
  { k: 'Runtime',       v: 'Node 22',          d: 'TypeScript · pnpm workspaces' },
  { k: 'Discovery',     v: 'SerpApi',          d: 'Google Jobs engine' },
  { k: 'Reasoning',     v: 'OpenAI',           d: 'analyze + score · model in src/constants.ts' },
  { k: 'Persistence',   v: 'Google Sheets',    d: 'via Apps Script Web App' },
  { k: 'Observability', v: 'JSONL + SSE',      d: 'append-only · streamed to the UI' },
  { k: 'Dashboard',     v: 'Tailwind + HTML',  d: 'single page · no build step' },
  { k: 'Tests',         v: 'Vitest',           d: '122 passing · ≥85% line coverage' },
  { k: 'Container',     v: 'Docker · GHCR',    d: 'multi-stage · arm64 + amd64' },
];

export function StackSection() {
  return (
    <section id="stack" className="relative py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          align="left"
          eyebrow="Under the hood"
          title={
            <>
              Boring tech, on purpose.{' '}
              <span className="italic font-serif text-muted-foreground">
                No frameworks. No magic.
              </span>
            </>
          }
          subtitle="A hand-rolled HTTP server, a single Google Sheet, and a folder of JSONL files. That's the entire system."
        />

        <div className="mt-14 grid sm:grid-cols-2 rounded-xl border bg-card/40 backdrop-blur-sm overflow-hidden">
          {rows.map((r, i) => (
            <div
              key={r.k}
              className={cn(
                'grid grid-cols-[120px_1fr] gap-4 items-baseline px-5 py-5',
                'border-foreground/8',
                i % 2 === 0 ? 'sm:border-r' : '',
                i < rows.length - 2 && 'border-b',
                i === rows.length - 2 && 'sm:border-b',
              )}
            >
              <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80">
                {r.k}
              </span>
              <div>
                <div className="text-[16px] font-medium tracking-tight text-foreground">
                  {r.v}
                </div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  {r.d}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
