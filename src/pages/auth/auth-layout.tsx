import { Sparkles, Check, BarChart3, FileText, Target, Send } from "lucide-react";

// Premium split auth shell. Left = aurora/mesh brand wall (gradient base + soft
// blurred orbs + faded dot grid + glass highlights). Right = minimal form on the
// dark base. Shared by login + signup for a consistent first impression.

const MESH =
  "radial-gradient(at 0% 0%, #1e3a8a 0%, transparent 55%)," +
  "radial-gradient(at 100% 0%, #4c1d95 0%, transparent 50%)," +
  "radial-gradient(at 55% 100%, #155e75 0%, transparent 55%)," +
  "linear-gradient(160deg, #0a1130 0%, #070a1c 55%, #050816 100%)";

const FEATURES = [
  { icon: Target, label: "Score every job against your real skills" },
  { icon: FileText, label: "Tailored resumes & cover letters in seconds" },
  { icon: Send, label: "Prepared applications, ready to submit" },
  { icon: BarChart3, label: "Track it all in one calm dashboard" },
];

const STATS = [
  { value: "10x", label: "faster applications" },
  { value: "85%", label: "match accuracy" },
  { value: "3x", label: "more interviews" },
];

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between p-12" style={{ background: MESH }}>
      {/* Soft gradient orbs */}
      <div className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.45), transparent 70%)" }} />
      <div className="pointer-events-none absolute right-[-7rem] top-1/3 h-96 w-96 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.42), transparent 70%)" }} />
      <div className="pointer-events-none absolute bottom-[-4rem] left-1/4 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(6,182,212,0.22), transparent 70%)" }} />
      {/* Faded dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 60% at 30% 25%, #000 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 30% 25%, #000 30%, transparent 75%)",
        }}
      />

      {/* Brand */}
      <div className="relative z-10 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
          <Sparkles className="h-5 w-5 text-white" strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-bold text-white">JobPilot</p>
          <p className="text-[11px] font-medium text-white/55">Career Copilot</p>
        </div>
      </div>

      {/* Headline + features */}
      <div className="relative z-10 max-w-md space-y-7">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> AI Career Copilot
          </span>
          <h2 className="text-[40px] font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Your job search,
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
              on autopilot.
            </span>
          </h2>
          <p className="text-[15px] leading-relaxed text-white/70">
            Discover roles, score matches, tailor documents, and prepare every application — all in one
            intelligent workspace.
          </p>
        </div>

        <ul className="space-y-2.5">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-3.5 w-3.5 text-white/90" strokeWidth={1.9} />
              </span>
              <span className="text-sm text-white/85">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stat chips */}
      <div className="relative z-10 grid grid-cols-3 gap-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 backdrop-blur">
            <div className="text-2xl font-bold tracking-tight text-white">{s.value}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-white/60">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand mark */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
              <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
            </div>
            <span className="text-base font-bold">JobPilot</span>
          </div>

          <div className="mb-7">
            <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em]">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          {footer && <p className="mt-7 text-center text-sm text-muted-foreground">{footer}</p>}
        </div>
      </div>
    </div>
  );
}

// Reusable check row (kept for any future auth content needing it).
export function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-white/85">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <span className="text-sm">{children}</span>
    </li>
  );
}
