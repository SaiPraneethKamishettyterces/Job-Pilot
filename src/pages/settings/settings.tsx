import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { exportAccount, deleteAccount } from "@/services/api";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [approvalMode, setApprovalMode] = useState("ALWAYS_REVIEW");
  const [dailyDigest, setDailyDigest] = useState(true);
  const [followUpReminders, setFollowUpReminders] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = () => toast.success("Settings saved");

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAccount();
      toast.success("Your data export has been downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Permanently delete your account and ALL data? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted");
      logout();
      navigate("/signup");
    } catch {
      toast.error("Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input defaultValue={user?.name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input defaultValue={user?.email ?? ""} disabled />
          </div>
          <Button onClick={save} size="sm">
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </CardContent>
      </Card>

      {/* Application rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application Rules</CardTitle>
          <CardDescription>Control how JobPilot applies on your behalf</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Approval mode</Label>
            <Select value={approvalMode} onValueChange={setApprovalMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO_APPLY">Auto Apply</SelectItem>
                <SelectItem value="ASSISTED_APPLY">Assisted Apply</SelectItem>
                <SelectItem value="ALWAYS_REVIEW">Always Review</SelectItem>
                <SelectItem value="DRAFT_ONLY">Draft Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Daily digest</p>
              <p className="text-xs text-muted-foreground">Email summary of today's applications</p>
            </div>
            <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Follow-up reminders</p>
              <p className="text-xs text-muted-foreground">Remind me to follow up after 7 days</p>
            </div>
            <Switch checked={followUpReminders} onCheckedChange={setFollowUpReminders} />
          </div>

          <Button onClick={save} size="sm">
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </CardContent>
      </Card>

      {/* Privacy & data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy &amp; Data</CardTitle>
          <CardDescription>Access and control the data JobPilot holds about you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export my data</p>
              <p className="text-xs text-muted-foreground">Download all your profile, applications, and activity as JSON</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
