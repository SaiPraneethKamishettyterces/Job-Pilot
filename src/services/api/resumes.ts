import { api } from "./client.js";

export interface SkillGroup { category: string; skills: string[] }
export interface ExperienceItem { company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; bullets: string[] }
export interface ProjectItem { name: string; org: string; link: string; bullets: string[] }
export interface EducationItem { institution: string; degree: string; location: string; gpa: string; achievements: string[]; coursework: string[] }
export interface ResumeContent {
  targetJobTitle: string;
  name: string; email: string; phone: string; location: string;
  summary: string;
  skillGroups: SkillGroup[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
}

export interface ResumeSummary {
  id: string;
  fileName: string;
  isPrimary: boolean;
  analysisComplete: boolean;
  targetJobTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail {
  id: string;
  fileName: string;
  isPrimary: boolean;
  content: ResumeContent;
}

export async function listResumes(): Promise<{ resumes: ResumeSummary[]; limit: number }> {
  const { data } = await api.get("/api/resumes");
  return data;
}

export async function getResume(id: string): Promise<{ resume: ResumeDetail }> {
  const { data } = await api.get(`/api/resumes/${id}`);
  return data;
}

export async function updateResume(
  id: string,
  body: { fileName?: string; content?: ResumeContent },
): Promise<{ resume: ResumeDetail }> {
  const { data } = await api.patch(`/api/resumes/${id}`, body);
  return data;
}

export async function setPrimaryResume(id: string): Promise<void> {
  await api.post(`/api/resumes/${id}/primary`);
}

export async function deleteResume(id: string): Promise<void> {
  await api.delete(`/api/resumes/${id}`);
}
