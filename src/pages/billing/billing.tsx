import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Check, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getSubscription,
  startCheckout,
  openBillingPortal,
  activateSubscription,
} from "@/services/api";

const PLANS = [
  {
    slug: "free", name: "Free", price: "$0", period: "forever",
    description: "Get started with manual uploads",
    features: ["5 manual job uploads", "Resume parsing", "Basic match scoring", "Cover letter drafts"],
  },
  {
    slug: "starter", name: "Starter", price: "$29", period: "per month",
    description: "Daily discovery + document generation",
    features: ["100 applications/month", "Daily job discovery", "Tailored resumes + cover letters", "Application tracker", "Email support"],
    highlighted: true,
  },
  {
    slug: "pro", name: "Pro", price: "$79", period: "per month",
    description: "Assisted automation + analytics",
    features: ["500 applications/month", "Assisted ATS automation", "Cold email generator", "Analytics dashboard", "Priority support"],
  },
];

export function BillingPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { data: sub, isLoading } = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });

  // Handle Stripe redirect return (?status=success|cancelled).
  useEffect(() => {
    const status = params.get("status");
    if (status === "success") {
      toast.success("Payment successful — your subscription is being activated.");
      qc.invalidateQueries({ queryKey: ["subscription"] });
      params.delete("status"); params.delete("session_id"); setParams(params, { replace: true });
    } else if (status === "cancelled") {
      toast.info("Checkout cancelled.");
      params.delete("status"); setParams(params, { replace: true });
    }
  }, [params, qc, setParams]);

  const checkout = useMutation({
    mutationFn: (plan: string) => startCheckout(plan),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: () => toast.error("Could not start checkout"),
  });
  const activateTest = useMutation({
    mutationFn: () => activateSubscription(),
    onSuccess: () => { toast.success("Activated (test mode) — pipeline started"); qc.invalidateQueries({ queryKey: ["subscription"] }); },
    onError: () => toast.error("Activation failed"),
  });
  const portal = useMutation({
    mutationFn: () => openBillingPortal(),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: () => toast.error("Could not open billing portal"),
  });

  const isActive = sub?.status === "active";
  const stripeEnabled = sub?.stripeEnabled ?? false;

  function selectPlan(slug: string) {
    if (slug === "free") return;
    if (stripeEnabled) checkout.mutate(slug);
    else activateTest.mutate(); // test mode: no Stripe keys configured
  }

  return (
    <div className="space-y-8">
      {/* Current subscription */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : (
              <>Status: <span className="font-medium">{sub?.status ?? "inactive"}</span>
              {sub?.planName ? ` · ${sub.planName}` : ""}
              {sub?.currentPeriodEnd ? ` · renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : ""}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!stripeEnabled && (
            <div className="rounded-lg bg-warning/10 p-3 text-sm text-muted-foreground">
              Stripe is not configured — running in <span className="font-medium">test mode</span>.
              Selecting a paid plan activates the subscription directly so you can try the full flow.
            </div>
          )}
          <div className="flex items-center gap-3">
            <Badge variant={isActive ? "success" : "secondary"}>{isActive ? "Active" : "Inactive"}</Badge>
            {isActive && stripeEnabled && (
              <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
                {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Manage billing
              </Button>
            )}
          </div>

          {sub?.usage && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Applications this month</span>
                <span className="tabular-nums text-muted-foreground">
                  {sub.usage.applicationsUsed} / {sub.usage.applicationsPerMonth}
                </span>
              </div>
              <Progress
                value={Math.min(100, sub.usage.applicationsPerMonth > 0
                  ? (sub.usage.applicationsUsed / sub.usage.applicationsPerMonth) * 100
                  : 0)}
                className="h-1.5"
              />
              <p className="text-xs text-muted-foreground">
                {sub.usage.applicationsRemaining > 0
                  ? `${sub.usage.applicationsRemaining} remaining on the ${sub.usage.planName} plan`
                  : `Monthly limit reached on the ${sub.usage.planName} plan — upgrade for more.`}
                {" "}Resets {new Date(sub.usage.periodResetsAt).toLocaleDateString()}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <h3 className="text-base font-semibold mb-4">Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const current = isActive && (plan.slug === "starter" || (sub?.planName ?? "").toLowerCase().includes(plan.slug));
            const pending = checkout.isPending || activateTest.isPending;
            return (
              <Card key={plan.slug} className={plan.highlighted ? "border-primary ring-1 ring-primary" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {current && <Badge variant="info">Current</Badge>}
                    {plan.highlighted && !current && <Badge variant="default"><Zap className="h-3 w-3 mr-1" />Popular</Badge>}
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
                        <Check className="h-4 w-4 text-success shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.slug === "free" || current ? "outline" : "default"}
                    disabled={plan.slug === "free" || current || pending}
                    onClick={() => selectPlan(plan.slug)}
                  >
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {plan.slug === "free" ? "Free" : current ? "Current plan" : stripeEnabled ? `Upgrade to ${plan.name}` : "Activate (test)"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
