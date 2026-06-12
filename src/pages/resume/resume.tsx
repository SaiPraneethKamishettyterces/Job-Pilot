import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, CheckCircle, Loader2, Edit, User, Briefcase, GraduationCap, Code } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const MOCK_PROFILE = {
  name: "Alex Johnson",
  email: "alex@example.com",
  phone: "+1 (555) 123-4567",
  location: "San Francisco, CA",
  summary: "Senior software engineer with 7 years of experience building scalable web applications and distributed systems. Passionate about developer tools and open-source.",
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker", "GraphQL", "Redis"],
  experience: [
    { title: "Senior Software Engineer", company: "Acme Corp", duration: "Jan 2021 – Present", description: "Led architecture of microservices platform serving 10M+ users" },
    { title: "Software Engineer", company: "TechStartup", duration: "Jun 2019 – Jan 2021", description: "Built real-time features using WebSockets and React" },
  ],
  education: [
    { degree: "B.S. Computer Science", school: "UC Berkeley", year: "2019" },
  ],
};

export function ResumePage() {
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done">("done");

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setUploadStatus("uploading");
    try {
      await new Promise((r) => setTimeout(r, 2000));
      setUploadStatus("done");
      toast.success("Resume updated and re-parsed!");
    } catch {
      setUploadStatus("idle");
      toast.error("Upload failed");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resume File
              </CardTitle>
              <CardDescription>Upload a new version to re-parse your profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadStatus === "done" && (
                <div className="flex items-center gap-3 rounded-lg border bg-success/5 border-success/20 p-3">
                  <CheckCircle className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="text-sm font-medium">resume-2025.pdf</p>
                    <p className="text-xs text-muted-foreground">Uploaded today</p>
                  </div>
                </div>
              )}

              <div
                {...getRootProps()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <input {...getInputProps()} />
                {uploadStatus === "uploading" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                )}
                <p className="text-xs text-muted-foreground">
                  {uploadStatus === "uploading" ? "Parsing with Claude…" : "Drop or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground">PDF or DOCX</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Profile data */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Parsed Profile</CardTitle>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              </div>
              <CardDescription>Extracted from your resume by Claude AI — review before running</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="summary">
                <TabsList className="mb-4">
                  <TabsTrigger value="summary" className="gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="experience" className="gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    Experience
                  </TabsTrigger>
                  <TabsTrigger value="education" className="gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Education
                  </TabsTrigger>
                  <TabsTrigger value="skills" className="gap-1.5">
                    <Code className="h-3.5 w-3.5" />
                    Skills
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{MOCK_PROFILE.name}</span></div>
                    <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{MOCK_PROFILE.email}</span></div>
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{MOCK_PROFILE.phone}</span></div>
                    <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{MOCK_PROFILE.location}</span></div>
                  </div>
                  <Separator />
                  <p className="text-sm text-muted-foreground leading-relaxed">{MOCK_PROFILE.summary}</p>
                </TabsContent>

                <TabsContent value="experience" className="space-y-4">
                  {MOCK_PROFILE.experience.map((exp, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{exp.title}</p>
                          <p className="text-xs text-muted-foreground">{exp.company}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{exp.duration}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{exp.description}</p>
                      {i < MOCK_PROFILE.experience.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="education" className="space-y-3">
                  {MOCK_PROFILE.education.map((edu, i) => (
                    <div key={i} className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{edu.degree}</p>
                        <p className="text-xs text-muted-foreground">{edu.school}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{edu.year}</span>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="skills">
                  <div className="flex flex-wrap gap-2">
                    {MOCK_PROFILE.skills.map((skill) => (
                      <Badge key={skill} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
