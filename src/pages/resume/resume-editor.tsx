import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { getResume, updateResume, type ResumeContent } from "@/services/api";

// ── Module-scope field primitives (stable identity → no focus loss) ───────────
function Field({ label, value, onChange, placeholder, textarea, rows }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; rows?: number;
}) {
  return (
    <div className="space-y-1">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      {textarea
        ? <Textarea value={value} placeholder={placeholder} rows={rows ?? 3} className="resize-none" onChange={(e) => onChange(e.target.value)} />
        : <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function Chips({ items, onChange, placeholder }: { items: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v && !items.includes(v)) onChange([...items, v]); setDraft(""); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((s) => (
        <Badge key={s} variant="secondary" className="gap-1 rounded-full pr-1">
          {s}
          <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(items.filter((x) => x !== s))} className="rounded-full p-0.5 hover:bg-foreground/20">
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder ?? "Add skill…"}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function Bullets({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2.5 text-muted-foreground">•</span>
          <Textarea
            value={b} rows={2} className="resize-none"
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button variant="ghost" size="icon" className="mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove bullet" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onChange([...items, ""])}>
        <Plus className="h-3.5 w-3.5" /> Add bullet
      </Button>
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function ResumeEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError } = useQuery({ queryKey: ["resume", id], queryFn: () => getResume(id), enabled: Boolean(id) });
  useEffect(() => { if (data) { setContent(data.resume.content); setDirty(false); } }, [data]);

  const save = useMutation({
    mutationFn: () => updateResume(id, { content: content! }),
    onSuccess: () => { toast.success("Resume saved"); setDirty(false); queryClient.invalidateQueries({ queryKey: ["resumes"] }); },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  // Mutate helper: clone → mutate → set dirty.
  const edit = (fn: (c: ResumeContent) => void) =>
    setContent((c) => { if (!c) return c; const n = structuredClone(c); fn(n); return n; });
  const onEdit = (fn: (c: ResumeContent) => void) => { edit(fn); setDirty(true); };

  if (isLoading || !content) {
    return isError
      ? <div className="py-16 text-center text-sm text-destructive">Resume not found. <button className="text-primary hover:underline" onClick={() => navigate("/resume")}>Back to resumes</button></div>
      : <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const c = content;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* toolbar */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-background/80 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/resume")}><ArrowLeft className="h-4 w-4" /> Resumes</Button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      {/* contact / header */}
      <Card className="p-5">
        <Input value={c.name} placeholder="Your name" onChange={(e) => onEdit((d) => { d.name = e.target.value; })} className="mb-2 h-auto border-0 bg-transparent px-0 text-2xl font-bold focus-visible:ring-0" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Target job title" value={c.targetJobTitle} placeholder="e.g. Data Analyst" onChange={(v) => onEdit((d) => { d.targetJobTitle = v; })} />
          <Field label="Email" value={c.email} onChange={(v) => onEdit((d) => { d.email = v; })} />
          <Field label="Phone" value={c.phone} onChange={(v) => onEdit((d) => { d.phone = v; })} />
          <Field label="Location" value={c.location} onChange={(v) => onEdit((d) => { d.location = v; })} />
        </div>
      </Card>

      <SectionCard title="Professional Summary">
        <Textarea value={c.summary} rows={5} className="resize-none" placeholder="Brief professional summary…" onChange={(e) => onEdit((d) => { d.summary = e.target.value; })} />
      </SectionCard>

      <SectionCard
        title="Core Skills"
        action={<Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onEdit((d) => { d.skillGroups.push({ category: "New category", skills: [] }); })}><Plus className="h-3.5 w-3.5" /> Add group</Button>}
      >
        <div className="space-y-4">
          {c.skillGroups.map((g, gi) => (
            <div key={gi} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input value={g.category} onChange={(e) => onEdit((d) => { d.skillGroups[gi].category = e.target.value; })} className="h-8 max-w-xs text-sm font-semibold" />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Remove group" onClick={() => onEdit((d) => { d.skillGroups.splice(gi, 1); })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <Chips items={g.skills} onChange={(next) => onEdit((d) => { d.skillGroups[gi].skills = next; })} />
            </div>
          ))}
          {c.skillGroups.length === 0 && <p className="text-sm text-muted-foreground">No skill groups yet — add one.</p>}
        </div>
      </SectionCard>

      <SectionCard
        title="Experience"
        action={<Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onEdit((d) => { d.experience.unshift({ company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] }); })}><Plus className="h-3.5 w-3.5" /> Add</Button>}
      >
        <div className="space-y-4">
          {c.experience.map((e, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field value={e.company} placeholder="Company" onChange={(v) => onEdit((d) => { d.experience[i].company = v; })} />
                  <Field value={e.title} placeholder="Title" onChange={(v) => onEdit((d) => { d.experience[i].title = v; })} />
                  <Field value={e.location} placeholder="Location" onChange={(v) => onEdit((d) => { d.experience[i].location = v; })} />
                  <div className="flex gap-2">
                    <Input value={e.startDate} placeholder="Start" onChange={(ev) => onEdit((d) => { d.experience[i].startDate = ev.target.value; })} />
                    <Input value={e.endDate} placeholder={e.current ? "Present" : "End"} disabled={e.current} onChange={(ev) => onEdit((d) => { d.experience[i].endDate = ev.target.value; })} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove experience" onClick={() => onEdit((d) => { d.experience.splice(i, 1); })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={e.current} onChange={(ev) => onEdit((d) => { d.experience[i].current = ev.target.checked; })} /> Current role</label>
              <Bullets items={e.bullets} onChange={(next) => onEdit((d) => { d.experience[i].bullets = next; })} />
            </div>
          ))}
          {c.experience.length === 0 && <p className="text-sm text-muted-foreground">No experience yet.</p>}
        </div>
      </SectionCard>

      <SectionCard
        title="Projects"
        action={<Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onEdit((d) => { d.projects.unshift({ name: "", org: "", link: "", bullets: [] }); })}><Plus className="h-3.5 w-3.5" /> Add</Button>}
      >
        <div className="space-y-4">
          {c.projects.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                  <Field value={p.name} placeholder="Project name" onChange={(v) => onEdit((d) => { d.projects[i].name = v; })} />
                  <Field value={p.org} placeholder="Organization" onChange={(v) => onEdit((d) => { d.projects[i].org = v; })} />
                  <Field value={p.link} placeholder="Link" onChange={(v) => onEdit((d) => { d.projects[i].link = v; })} />
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove project" onClick={() => onEdit((d) => { d.projects.splice(i, 1); })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <Bullets items={p.bullets} onChange={(next) => onEdit((d) => { d.projects[i].bullets = next; })} />
            </div>
          ))}
          {c.projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
        </div>
      </SectionCard>

      <SectionCard
        title="Education"
        action={<Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onEdit((d) => { d.education.unshift({ institution: "", degree: "", location: "", gpa: "", achievements: [], coursework: [] }); })}><Plus className="h-3.5 w-3.5" /> Add</Button>}
      >
        <div className="space-y-4">
          {c.education.map((ed, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field value={ed.institution} placeholder="Institution" onChange={(v) => onEdit((d) => { d.education[i].institution = v; })} />
                  <Field value={ed.degree} placeholder="Degree, field" onChange={(v) => onEdit((d) => { d.education[i].degree = v; })} />
                  <Field value={ed.location} placeholder="Location" onChange={(v) => onEdit((d) => { d.education[i].location = v; })} />
                  <Field value={ed.gpa} placeholder="GPA" onChange={(v) => onEdit((d) => { d.education[i].gpa = v; })} />
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove education" onClick={() => onEdit((d) => { d.education.splice(i, 1); })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div><Label className="text-xs text-muted-foreground">Achievements</Label><Bullets items={ed.achievements} onChange={(next) => onEdit((d) => { d.education[i].achievements = next; })} /></div>
              <Separator />
              <div><Label className="text-xs text-muted-foreground">Coursework</Label><Chips items={ed.coursework} onChange={(next) => onEdit((d) => { d.education[i].coursework = next; })} placeholder="Add course…" /></div>
            </div>
          ))}
          {c.education.length === 0 && <p className="text-sm text-muted-foreground">No education yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
