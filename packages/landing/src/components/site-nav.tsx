import { useEffect, useState } from 'react';
import { ArrowUpRight, Github, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#cost', label: 'Cost' },
  { href: '#stack', label: 'Stack' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-3 inset-x-0 z-50 flex justify-center px-3 transition-all duration-300',
      )}
    >
      <nav
        className={cn(
          'flex items-center gap-0.5 sm:gap-1 rounded-full border pl-1.5 pr-1.5 sm:pl-2 sm:pr-2 py-1 sm:py-1.5 max-w-full',
          'bg-background/70 backdrop-blur-xl backdrop-saturate-150',
          'shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_10px_40px_-12px_rgba(0,0,0,0.5)]',
          'transition-all duration-300',
          scrolled && 'bg-background/85 border-foreground/10',
        )}
      >
        <a
          href="#"
          className="flex items-center gap-2 pl-1.5 sm:pl-2.5 pr-1.5 sm:pr-2 shrink-0 group"
        >
          <span className="relative grid place-items-center size-6 rounded-md bg-brand/15 ring-1 ring-inset ring-brand/30">
            <Crosshair className="size-3.5 text-brand" strokeWidth={2.2} />
          </span>
          <span className="font-semibold text-[13.5px] sm:text-[14px] tracking-tight">
            Jobhound
          </span>
          <span className="ml-1 hidden lg:inline-block text-[10.5px] font-mono tracking-wide text-muted-foreground">
            v0.1.0
          </span>
        </a>

        <div className="hidden md:flex items-center ml-1 lg:ml-2 mr-1">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-2.5 lg:px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors rounded-full"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 pl-0.5 sm:pl-1">
          <Button
            asChild
            size="icon"
            variant="ghost"
            aria-label="Star on GitHub"
            className="rounded-full text-muted-foreground hover:text-foreground size-8"
          >
            <a
              href="https://github.com/lakshaykamat/jobhound"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="size-3.5" />
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="default"
            className="rounded-full h-8 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] gap-1 sm:gap-1.5 shrink-0"
          >
            <a
              href="https://github.com/lakshaykamat/jobhound"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="hidden min-[380px]:inline">Get started</span>
              <span className="min-[380px]:hidden">Start</span>
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </nav>
    </header>
  );
}
