import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Zap,
  FileText,
  Settings,
  CreditCard,
  Shield,
  ExternalLink,
  Mail,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type FaqItem = { q: string; a: string };

const FAQ_SECTIONS: { icon: typeof BookOpen; title: string; color: string; items: FaqItem[] }[] = [
  {
    icon: Zap,
    title: "Getting Started",
    color: "text-primary",
    items: [
      {
        q: "How do I set up JobPilot for the first time?",
        a: "After signing up, you'll go through a 5-step onboarding: enter your basic details, upload your resume (we'll parse it automatically with Claude AI), set your target roles and companies, set your location and salary preferences, and finally choose your approval mode. The whole setup takes about 5 minutes.",
      },
      {
        q: "What file formats does resume upload support?",
        a: "JobPilot accepts PDF and DOCX files up to 10 MB. Claude AI extracts your skills, work history, education, and projects into a structured profile used for scoring and document generation.",
      },
      {
        q: "What is an 'Application Run'?",
        a: "A Run is one automated discovery cycle. When you start a Run, JobPilot discovers jobs from your configured sources, scores them against your profile, generates tailored documents for shortlisted jobs, and (depending on your approval mode) submits applications on your behalf. You can run multiple times per day.",
      },
      {
        q: "Can I use JobPilot without automating applications?",
        a: "Yes. Set your Approval Mode to 'Always Review' or 'Draft Only'. In Draft Only mode, JobPilot generates tailored resumes and cover letters but never submits — you handle every submission yourself.",
      },
    ],
  },
  {
    icon: FileText,
    title: "Applications & Documents",
    color: "text-violet-500",
    items: [
      {
        q: "How does match scoring work?",
        a: "JobPilot scores each job 0–100 using a weighted formula: 25% title/role match, 30% skill overlap, 15% experience level, 10% location/remote fit, 10% salary compatibility, 10% company preferences + ATS complexity. Jobs below your threshold (default 70%) are archived with reason codes.",
      },
      {
        q: "Will JobPilot invent skills or experience I don't have?",
        a: "Never. JobPilot's AI guardrails strictly prohibit hallucination. It only rewrites, reorders, and emphasizes experience that exists in your verified profile. Work history dates, company names, degree names, and certifications are never altered.",
      },
      {
        q: "What happens when a job requires sensitive answers (salary, sponsorship, relocation)?",
        a: "JobPilot automatically pauses and routes the application to your Review Queue when it encounters sensitive fields — work authorization, sponsorship requirements, disability/veteran status, salary expectations, and relocation questions. You'll be notified to review before any submission.",
      },
      {
        q: "How do I track where my applications stand?",
        a: "The Applications page shows every application with its status (Applied, Needs Review, Generated, Declined, etc.), match score, ATS platform, and follow-up date. You can filter by status and search by company or role. The Review Queue handles anything waiting for your approval.",
      },
    ],
  },
  {
    icon: Settings,
    title: "Approval Modes",
    color: "text-amber-500",
    items: [
      {
        q: "What is 'Auto Apply' mode?",
        a: "Auto Apply submits applications directly to simple ATS forms (Greenhouse, Lever, Ashby, Workable) without your review for each one. It automatically pauses for sensitive questions and low-confidence forms. Best for high-volume job searches with well-defined criteria.",
      },
      {
        q: "What is 'Assisted Apply' mode?",
        a: "Assisted Apply prepares everything — fills the ATS form, generates all documents — but pauses before each final click to submit. You verify the filled form in a browser window before it goes through. Best for controlled automation.",
      },
      {
        q: "What is 'Always Review' mode?",
        a: "Every application lands in your Review Queue before submission. You see the job, the tailored resume, and the cover letter side-by-side, and decide to Approve, Edit, or Decline each one. Highest control, lower throughput.",
      },
      {
        q: "Can I change my approval mode after onboarding?",
        a: "Yes — go to Profile → Job Preferences and change your Approval Mode at any time. The change applies to the next Run you start.",
      },
    ],
  },
  {
    icon: CreditCard,
    title: "Billing & Plans",
    color: "text-emerald-500",
    items: [
      {
        q: "What's included in the Free plan?",
        a: "The Free plan gives you 5 manual job uploads per month, resume parsing, basic match scoring, and cover letter drafts. No automation, no daily discovery.",
      },
      {
        q: "What does the Starter plan include?",
        a: "Starter ($29/mo) includes 100 applications per month, daily job discovery, tailored resume and cover letter generation, the application tracker, and email support.",
      },
      {
        q: "How do I cancel my subscription?",
        a: "Go to Billing → Manage Billing. You can cancel at any time and retain access until the end of your current billing period. No cancellation fees.",
      },
      {
        q: "Are there usage limits for AI features?",
        a: "AI costs are included in your plan price. The dashboard shows your AI spend today and this month for transparency, but you won't be charged extra as long as you stay within your application limit.",
      },
    ],
  },
  {
    icon: Shield,
    title: "Privacy & Security",
    color: "text-rose-500",
    items: [
      {
        q: "Is my resume and job data secure?",
        a: "Yes. All data is stored in Google Cloud (Cloud SQL + Cloud Storage), encrypted at rest and in transit. We never sell your data or share it with job boards or third parties.",
      },
      {
        q: "Can JobPilot bypass CAPTCHAs or OTPs?",
        a: "No. JobPilot never attempts to bypass CAPTCHA, OTP, or any login verification. Encountering one automatically pauses the run and notifies you.",
      },
      {
        q: "How do I delete my account and data?",
        a: "Go to Settings → Danger Zone → Delete Account. This permanently removes your account, profile, resumes, and all application history. This action cannot be undone.",
      },
    ],
  },
];

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="divide-y">
      {items.map((item, i) => (
        <div key={i}>
          <button
            type="button"
            aria-expanded={open === i}
            className="w-full text-left py-4 flex items-center justify-between gap-4 hover:text-foreground text-foreground/90 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="text-sm font-medium leading-snug">{item.q}</span>
            {open === i ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          {open === i && (
            <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function HelpPage() {
  const [search, setSearch] = useState("");

  const filteredSections = search.trim()
    ? FAQ_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter(
          (item) =>
            item.q.toLowerCase().includes(search.toLowerCase()) ||
            item.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((s) => s.items.length > 0)
    : FAQ_SECTIONS;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">JobPilot</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-primary/5 border-b py-14">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Badge variant="secondary" className="mb-4">Help Center</Badge>
          <h1 className="text-4xl font-bold mb-3">How can we help?</h1>
          <p className="text-muted-foreground mb-8 text-lg">
            Find answers to common questions about JobPilot.
          </p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions…"
              aria-label="Search help articles"
              className="pl-10 h-11 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-14 space-y-10">
        {/* Quick links */}
        {!search && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FAQ_SECTIONS.map((s) => (
              <Card key={s.title} className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2.5">
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                    <CardTitle className="text-sm">{s.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground">{s.items.length} articles</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* FAQ sections */}
        {filteredSections.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No results for "{search}"</p>
            <p className="text-xs text-muted-foreground mb-4">Try different keywords or contact support.</p>
            <Button variant="outline" asChild>
              <Link to="/contact">
                <Mail className="h-4 w-4" />
                Contact Support
              </Link>
            </Button>
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-3">
                <section.icon className={`h-4 w-4 ${section.color}`} />
                <h2 className="text-base font-semibold">{section.title}</h2>
              </div>
              <Card>
                <CardContent className="px-6 py-0">
                  <FaqAccordion items={section.items} />
                </CardContent>
              </Card>
            </div>
          ))
        )}

        {/* Still need help */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold mb-1">Still need help?</p>
              <p className="text-sm text-muted-foreground">
                Our support team typically replies within one business day.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Button variant="outline" asChild>
                <a href="https://docs.jobpilot.ai" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Docs
                </a>
              </Button>
              <Button asChild>
                <Link to="/contact">
                  <Mail className="h-4 w-4" />
                  Contact Support
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
