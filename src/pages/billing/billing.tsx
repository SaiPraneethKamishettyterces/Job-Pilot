import { CreditCard, Check, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with manual uploads",
    features: ["5 manual job uploads", "Resume parsing", "Basic match scoring", "Cover letter drafts"],
    cta: "Current plan",
    current: false,
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$29",
    period: "per month",
    description: "Daily discovery + document generation",
    features: ["100 applications/month", "Daily job discovery", "Tailored resumes + cover letters", "Application tracker", "Email support"],
    cta: "Upgrade to Starter",
    current: true,
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$79",
    period: "per month",
    description: "Assisted automation + analytics",
    features: ["500 applications/month", "Assisted ATS automation", "Cold email generator", "Analytics dashboard", "Priority support"],
    cta: "Upgrade to Pro",
    current: false,
    highlighted: false,
  },
];

export function BillingPage() {
  return (
    <div className="space-y-8">
      {/* Current usage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Current Plan — Starter
          </CardTitle>
          <CardDescription>Renews June 30, 2025 · Paid monthly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Applications used</span>
              <span className="font-medium">34 / 100</span>
            </div>
            <Progress value={34} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">AI cost this month</p>
              <p className="text-xs text-muted-foreground">Included in your plan</p>
            </div>
            <span className="text-sm font-semibold">$4.23</span>
          </div>
          <Button variant="outline" size="sm">Manage billing</Button>
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <h3 className="text-base font-semibold mb-4">Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <Card key={plan.name} className={plan.highlighted ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {plan.current && <Badge variant="info">Current</Badge>}
                  {plan.highlighted && !plan.current && <Badge variant="default"><Zap className="h-3 w-3 mr-1" />Popular</Badge>}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground pb-1">{plan.period}</span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={plan.current ? "outline" : "default"} disabled={plan.current}>
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
