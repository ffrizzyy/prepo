"use client";

import { motion } from "motion/react";
import { BellRinging, Ticket } from "@phosphor-icons/react";
import { SAMPLE_ACTION_ITEMS } from "@prepo/shared";
import { Section } from "@/components/ui/section";
import { ActionItemCard } from "./action-item-card";

const FOUNDATION_ITEM = SAMPLE_ACTION_ITEMS[0]!;

function CaptureVisual() {
  const lines = [
    { speaker: "Lena", text: "Where are the webhook retries?" },
    { speaker: "Priya", text: "I need to fix the checkout webhook retry bug this week." },
    { speaker: "Sam", text: "I'll ship the pricing page copy by next Friday." },
  ];
  return (
    <div className="space-y-2.5">
      {lines.map((line) => (
        <div key={line.text} className="rounded-[10px] bg-surface p-3 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-wide text-accent-ink">
            {line.speaker}
          </span>
          <p className="mt-1 text-text-muted">{line.text}</p>
        </div>
      ))}
    </div>
  );
}

function FollowUpVisual() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-[10px] bg-surface p-3 text-xs">
        <BellRinging size={16} className="mt-0.5 shrink-0 text-accent-ink" />
        <div>
          <p className="text-text">Reminder: “Fix the checkout webhook retry bug” is due today.</p>
          <p className="mt-1 font-mono text-[10px] text-text-subtle">to Priya · email + in-app</p>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-[10px] bg-[#b91c1c]/10 p-3 text-xs">
        <BellRinging size={16} className="mt-0.5 shrink-0 text-[#b91c1c] dark:text-[#f87171]" />
        <div>
          <p className="text-text">Overdue +3 days — escalating to the meeting organizer.</p>
          <p className="mt-1 font-mono text-[10px] text-text-subtle">to Lena · email</p>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Capture",
    body: "Record a meeting, upload a recording, or paste the minutes. Either way, you get a speaker-labelled transcript.",
    visual: <CaptureVisual />,
  },
  {
    n: "02",
    title: "Extract & ticket",
    body: "Owners, deadlines, and priorities become tickets — grounded in the exact quote. Connect Linear and the issues mirror across.",
    visual: (
      <ActionItemCard
        item={FOUNDATION_ITEM}
        quote="I need to fix the checkout webhook retry bug this week, it's blocking the launch."
        timestamp="0:14"
        className="bg-surface"
      />
    ),
  },
  {
    n: "03",
    title: "Follow up",
    body: "Prepo reminds, nudges, and escalates on a schedule you control, and reports back until every ticket is done.",
    visual: <FollowUpVisual />,
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-t border-border">
      <div className="mb-12 flex items-end justify-between gap-6">
        <h2 className="max-w-xl text-3xl leading-tight tracking-tighter md:text-4xl">
          From a recording to a closed ticket
        </h2>
        <Ticket size={28} className="hidden text-text-subtle md:block" aria-hidden />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col rounded-2xl border border-border bg-surface-2/50 p-5"
          >
            <span className="font-mono text-xs text-text-subtle">{step.n}</span>
            <h3 className="mt-2 text-xl font-medium tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            <div className="mt-5">{step.visual}</div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
