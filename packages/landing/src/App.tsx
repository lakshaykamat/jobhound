import { SiteNav } from '@/components/site-nav';
import { Hero } from '@/components/hero';
import { HowItWorks } from '@/components/how-it-works';
import { FeaturesBento } from '@/components/features-bento';
import { CostMeters } from '@/components/cost-meters';
import { StackSection } from '@/components/stack-section';
import { CtaSection } from '@/components/cta-section';
import { SiteFooter } from '@/components/site-footer';

export default function App() {
  return (
    <div className="min-h-screen antialiased text-foreground">
      <SiteNav />
      <main>
        <Hero />
        <HowItWorks />
        <FeaturesBento />
        <CostMeters />
        <StackSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
