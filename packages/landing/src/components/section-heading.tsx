import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <Badge
        variant="muted"
        className="font-mono uppercase tracking-[0.18em] !text-[10.5px] !py-1 !px-2.5"
      >
        {eyebrow}
      </Badge>
      <h2 className="font-medium tracking-[-0.03em] leading-[1] text-[clamp(2rem,4.4vw,3.4rem)] max-w-3xl">
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            'text-[16px] text-muted-foreground leading-relaxed max-w-2xl',
            align === 'center' ? 'mx-auto' : '',
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
