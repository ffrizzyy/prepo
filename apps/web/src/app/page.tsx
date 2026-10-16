import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { WorksWith } from "@/components/marketing/works-with";
import { Problem } from "@/components/marketing/problem";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { BeforeAfter } from "@/components/marketing/before-after";
import { GetTheApp } from "@/components/marketing/get-the-app";
import { Security } from "@/components/marketing/security";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <WorksWith />
        <Problem />
        <HowItWorks />
        <Features />
        <BeforeAfter />
        <GetTheApp />
        <Security />
        <Faq />
      </main>
      <FinalCta />
    </>
  );
}
