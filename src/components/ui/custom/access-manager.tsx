// src/components/settings/access-manager-view.tsx (or directly in settings-modal.tsx)
import { useState } from "react"
import { KeyRound, Copy, Check, Shield, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createWorkspaceInvite, type WorkspaceRole } from "@/lib/auth/invites"

export function AccessManagerView({ workspaceId }: { workspaceId: string }) {
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<WorkspaceRole>("EDITOR")
  const [inviteUrl, setInviteUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const handleGenerateLink = async () => {
    if (!password) return
    setIsCreating(true)
    try {
      const { inviteId, rawToken } = await createWorkspaceInvite({
        workspaceId,
        password,
        role,
        expiresInHours: 24,
      })
      const url = `${window.location.origin}/join?id=${inviteId}&token=${rawToken}`
      setInviteUrl(url)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Create Invite Section */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Create Invite Link
          </h4>
          <p className="text-xs text-muted-foreground">
            Generate a single-use share link protected by password authorization.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Access Password</Label>
            <Input
              type="password"
              placeholder="Set invite password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role Permission</Label>
            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EDITOR" className="text-xs">Editor</SelectItem>
                <SelectItem value="VIEWER" className="text-xs">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleGenerateLink}
          disabled={!password || isCreating}
          className="text-xs w-full sm:w-auto"
        >
          {isCreating ? "Generating..." : "Generate Link"}
        </Button>

        {inviteUrl && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input value={inviteUrl} readOnly className="h-8 text-xs font-mono flex-1 bg-muted" />
            <Button size="sm" variant="outline" onClick={handleCopy} className="h-8 text-xs gap-1">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      {/* Active Session Info */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Active Workspace Token
        </h4>
        <div className="flex items-center justify-between text-xs p-2 rounded bg-muted/50 border">
          <div className="space-y-0.5">
            <p className="font-medium">Current Session Device</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {localStorage.getItem("device_id") || "Unknown Device"}
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              localStorage.removeItem("workspace_session_token")
              window.location.reload()
            }}
            className="h-7 text-xs gap-1"
          >
            <UserX className="h-3.5 w-3.5" />
            Revoke
          </Button>
        </div>
      </div>
    </div>
  )
}