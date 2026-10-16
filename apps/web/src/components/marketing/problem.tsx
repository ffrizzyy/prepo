"use client";

import { motion } from "motion/react";
import { Eyebrow, Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";

const NOTES = [
  {
    text: "Meeting sessions often produce long minutes that confuse people, with no clear instructions.",
    rotate: "-rotate-2",
  },
  {
    text: "Information overload after the meeting: every debate is recorded, but action items never get extracted, so people lose context about who does what.",
    rotate: "rotate-1",
  },
  {
    text: "Responsibility gets passed around, projects stall, and the corporate disease appears: a meeting to discuss a meeting.",
    rotate: "-rotate-1",
  },
];

export function Problem() {
  return (
    <Section id="problem">
      <div className="mb-12 max-w-2xl">
        <Eyebrow>Problem</Eyebrow>
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          Long minutes. Unclear actions.
        </h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {NOTES.map((note, index) => (
          <motion.div
            key={note.text}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "rounded-[6px] bg-accent-note p-6 text-[#3a1113] shadow-[0_12px_30px_-16px_rgb(0_0_0_/_0.4)] md:rotate-0",
              note.rotate,
            )}
          >
            <p className="text-sm leading-relaxed">{note.text}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
