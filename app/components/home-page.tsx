"use client";

import {
  Bot,
  Box,
  CheckCircle2,
  Database,
  GitPullRequest,
  Github,
  MessageSquareText,
  Terminal,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

const workflow = [
  {
    description: "GitHub App receives a PR mention or review comment.",
    label: "GitHub",
  },
  {
    description: "BullMQ stores the review job in Redis with retries.",
    label: "Queue",
  },
  {
    description: "A worker starts or reuses an isolated runtime provider.",
    label: "Runtime",
  },
  {
    description: "Pi runs the agent with OpenAI and writes back to the PR.",
    label: "Review",
  },
];

const facts = [
  "GitHub-native review",
  "Durable job queue",
  "Runtime provider boundary",
  "OpenAI model provider",
];

const setupCommands = ["cp .env.example .env", "docker compose up --build"];

const runtimeItems = [
  {
    Icon: CheckCircle2,
    text: "GitHub installation tokens are used for repository access.",
  },
  {
    Icon: Box,
    text: "Sealos DevBox is the current default provider for clone, install, inspect, test, and edit.",
  },
  {
    Icon: Database,
    text: "Redis and BullMQ replace durable workflow infrastructure.",
  },
  {
    Icon: MessageSquareText,
    text: "The result is posted back to the pull request.",
  },
];

const easeOut = [0.16, 1, 0.3, 1] as const;

const useEntrance = () => {
  const shouldReduceMotion = useReducedMotion();

  return {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0 },
  };
};

export const HomePage = () => {
  const entrance = useEntrance();
  const shouldReduceMotion = useReducedMotion();
  const transition = {
    duration: shouldReduceMotion ? 0.01 : 0.5,
    ease: easeOut,
  };
  const stagger = shouldReduceMotion ? 0 : 0.07;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        href="#main-content"
      >
        Skip to main content
      </a>

      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link className="flex items-center gap-2 font-semibold" href="/">
            <Bot aria-hidden="true" className="size-5" />
            RunReview
          </Link>
          <motion.a
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border/80 px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            href="https://github.com/zjy365/run-review"
            rel="noreferrer"
            target="_blank"
            whileHover={shouldReduceMotion ? undefined : { y: -1 }}
            whileTap={{ scale: 0.98 }}
          >
            <Github aria-hidden="true" className="size-4" />
            GitHub
          </motion.a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:py-16" id="main-content">
        <motion.section
          animate="visible"
          className="max-w-3xl"
          initial="hidden"
          transition={{ staggerChildren: stagger }}
          variants={entrance}
        >
          <motion.div className="mb-5 flex flex-wrap gap-2" variants={entrance}>
            {facts.map((fact) => (
              <span
                className="rounded-md border border-border/80 bg-muted px-2.5 py-1 text-sm text-muted-foreground"
                key={fact}
              >
                {fact}
              </span>
            ))}
          </motion.div>

          <motion.h1
            className="text-balance text-4xl font-semibold leading-tight tracking-normal sm:text-5xl"
            transition={transition}
            variants={entrance}
          >
            Executable PR reviews on your own runtime.
          </motion.h1>
          <motion.p
            className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground"
            transition={transition}
            variants={entrance}
          >
            RunReview is an open-source GitHub App for pull request review. It
            runs review jobs with Redis, BullMQ, Pi, OpenAI, and your own
            runtime provider.
          </motion.p>

          <motion.div
            className="mt-7 flex flex-col gap-3 sm:flex-row"
            transition={transition}
            variants={entrance}
          >
            <motion.a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              href="#setup"
              whileHover={shouldReduceMotion ? undefined : { y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Terminal aria-hidden="true" className="size-4" />
              Run locally
            </motion.a>
            <motion.a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border/80 px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              href="#workflow"
              whileHover={shouldReduceMotion ? undefined : { y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <GitPullRequest aria-hidden="true" className="size-4" />
              Read workflow
            </motion.a>
          </motion.div>
        </motion.section>

        <motion.section
          animate="visible"
          className="mt-14 border-t border-border/70 pt-10"
          id="workflow"
          initial="hidden"
          transition={{ staggerChildren: stagger }}
          variants={entrance}
        >
          <div className="grid gap-8 md:grid-cols-[15rem_1fr]">
            <motion.div transition={transition} variants={entrance}>
              <h2 className="text-2xl font-semibold tracking-normal">
                Workflow
              </h2>
              <p className="mt-3 text-pretty leading-7 text-muted-foreground">
                The app stays close to GitHub. The worker owns the execution
                path, while the runtime provider supplies the isolated
                workspace.
              </p>
            </motion.div>
            <ol className="grid gap-3">
              {workflow.map((step, index) => (
                <motion.li
                  className="grid gap-3 rounded-md border border-border/80 bg-card p-4 sm:grid-cols-[2.5rem_1fr]"
                  key={step.label}
                  transition={transition}
                  variants={entrance}
                >
                  <span className="flex size-10 items-center justify-center rounded-md bg-muted font-mono text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-medium tracking-normal">
                      {step.label}
                    </h3>
                    <p className="mt-1 leading-7 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </motion.section>

        <motion.section
          animate="visible"
          className="mt-14 grid gap-8 border-t border-border/70 pt-10 md:grid-cols-2"
          initial="hidden"
          transition={{ staggerChildren: stagger }}
          variants={entrance}
        >
          <motion.div transition={transition} variants={entrance}>
            <h2 className="text-2xl font-semibold tracking-normal">
              Runtime choices
            </h2>
            <ul className="mt-4 grid gap-3 text-muted-foreground">
              {runtimeItems.map(({ Icon, text }) => (
                <li className="flex gap-3" key={text}>
                  <Icon
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-foreground"
                  />
                  <span className="min-w-0 leading-7">{text}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className="min-w-0 rounded-md border border-border/80 bg-card"
            id="setup"
            transition={transition}
            variants={entrance}
          >
            <div className="border-b border-border/80 px-4 py-3">
              <h2 className="font-medium tracking-normal">Local setup</h2>
            </div>
            <pre className="max-w-full overflow-x-auto p-4 text-sm leading-7 text-muted-foreground">
              {setupCommands.map((command) => `$ ${command}`).join("\n")}
            </pre>
          </motion.div>
        </motion.section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Open-source PR review infrastructure, built around executable
            runtimes.
          </p>
          <a
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="https://github.com/zjy365/run-review#readme"
            rel="noreferrer"
            target="_blank"
          >
            Read README
          </a>
        </div>
      </footer>
    </div>
  );
};
