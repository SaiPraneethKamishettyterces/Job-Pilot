import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Loader2, FileText, CheckCircle, XCircle, RefreshCw, Send, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";
import { getActivity, type ActivityEvent } from "@/services/api";

function iconFor(type: string) {
  if (type.includes("submit")) return Send;
  if (type.includes("approve")) return CheckCircle;
  if (type.includes("declin") || type.includes("fail")) return XCircle;
  if (type.includes("retry")) return RefreshCw;
  if (type.includes("subscription") || type.includes("payment") || type.includes("activated")) return CreditCard;
  return FileText;
}

function labelFor(e: ActivityEvent): string {
  const t = e.type.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function ActivityPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["activity"],
    queryFn: () => getActivity(150),
    staleTime: 15_000,
  });

  const events = data?.events ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Activity Log</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          A timeline of everything JobPilot has done on your behalf
        </p>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load activity — make sure the server is running.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="h-4 w-4" />
            Recent Events
          </CardTitle>
          <CardDescription>Application lifecycle and subscription events, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center">
              <ActivityIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No activity yet</p>
              <p className="text-xs text-muted-foreground">Events appear here once you start a run.</p>
            </div>
          ) : (
            <ol className="relative border-l border-border ml-2">
              {events.map((e) => {
                const Icon = iconFor(e.type);
                return (
                  <li key={`${e.kind}-${e.id}`} className="mb-5 ml-5">
                    <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-muted ring-4 ring-background">
                      <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{labelFor(e)}</p>
                      <Badge variant="secondary" className="text-xs capitalize">{e.kind}</Badge>
                      <span className="text-xs text-muted-foreground">{formatRelativeDate(e.createdAt)}</span>
                    </div>
                    {(e.company || e.roleTitle) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.roleTitle}{e.company ? ` · ${e.company}` : ""}
                      </p>
                    )}
                    {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
