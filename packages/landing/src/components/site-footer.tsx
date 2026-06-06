import { Crosshair, Github } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const colA = [
  { label: 'Features',      href: '#features' },
  { label: 'How it works',  href: '#how-it-works' },
  { label: 'Cost meters',   href: '#cost' },
  { label: 'Stack',         href: '#stack' },
];

const colB = [
  { label: 'GitHub',          href: 'https://github.com/lakshaykamat/jobhound' },
  { label: 'Spec',            href: 'https://github.com/lakshaykamat/jobhound/blob/main/docs/prd.md' },
  { label: 'Deploy',          href: 'https://github.com/lakshaykamat/jobhound/blob/main/docs/deploy.md' },
  { label: 'Container',       href: 'https://github.com/lakshaykamat/jobhound/pkgs/container/jobhound' },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-foreground/8">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-6">
          <div className="lg:col-span-5">
            <a href="#" className="inline-flex items-center gap-2">
              <span className="grid place-items-center size-7 rounded-md bg-brand/15 ring-1 ring-inset ring-brand/30">
                <Crosshair className="size-4 text-brand" strokeWidth={2.2} />
              </span>
              <span className="font-semibold text-[15px] tracking-tight">
                Jobhound
              </span>
            </a>
            <p className="mt-4 text-[13.5px] text-muted-foreground leading-relaxed max-w-sm">
              One operator. One resume. One Google Sheet. Built in the open in
              Bengaluru.
            </p>
            <a
              href="https://github.com/lakshaykamat/jobhound"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <Github className="size-3.5" />
              github.com/lakshaykamat/jobhound
            </a>
          </div>

          <FooterCol title="Product" items={colA} className="lg:col-span-3" />
          <FooterCol title="Resources" items={colB} className="lg:col-span-3" />
        </div>

        <Separator className="my-8 bg-foreground/8" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[12px] text-muted-foreground/80 font-mono">
          <span>© 2026 Lakshay Kamat · Private · Single-operator deployment</span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            All systems nominal
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  items,
  className,
}: {
  title: string;
  items: { label: string; href: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 mb-4">
        {title}
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              target={item.href.startsWith('http') ? '_blank' : undefined}
              rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-[13.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
