// src/components/settings/access-manager-view.tsx

import { useState, useEffect } from "react"
import { KeyRound, Copy, Check, Shield, UserX, RefreshCw, Laptop, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { createWorkspaceInvite, generateOTP, getOrCreateDeviceId, type WorkspaceRole, type InviteType } from "@/lib/invite/fn"

interface InviteRecord {
  id: string
  type: InviteType
  role: WorkspaceRole
  otp: string
  isRedeemed: boolean
  createdAt: string
}

interface SessionRecord {
  deviceId: string
  isCurrent: boolean
  lastActive: string
}

export function AccessManagerView({ workspaceId }: { workspaceId: string }) {
  const [otp, setOtp] = useState(() => generateOTP(6))
  const [role, setRole] = useState<WorkspaceRole>("EDITOR")
  const [isSessionInvite, setIsSessionInvite] = useState(false)
  const [inviteUrl, setInviteUrl] = useState("")
  const [createdOtp, setCreatedOtp] = useState("")
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedOtp, setCopiedOtp] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Lists state
  const [invites, setInvites] = useState<InviteRecord[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])

  useEffect(() => {
    // Current active device session info
    const currentDevice = getOrCreateDeviceId()
    setSessions([
      { deviceId: currentDevice, isCurrent: true, lastActive: "Just now" },
    ])
  }, [])

  const handleRegenerateOtp = () => {
    setOtp(generateOTP(6))
  }

  const handleGenerateLink = async () => {
    if (!otp || otp.length < 6) return
    setIsCreating(true)
    try {
      const inviteType: InviteType = isSessionInvite ? "SESSION" : "SHARE"
      const targetWorkspaceId = isSessionInvite ? "*" : workspaceId
      const assignedRole = isSessionInvite ? "OWNER" : role

      const res = await createWorkspaceInvite({
        workspaceId: targetWorkspaceId,
        otp,
        inviteType,
        role: assignedRole,
        expiresInHours: 24,
      })

      const url = `${window.location.origin}/join?id=${res.inviteId}&token=${res.rawToken}&type=${inviteType}`
      setInviteUrl(url)
      setCreatedOtp(res.otp || otp)

      // Appends newly generated invite to the active list UI
      setInvites((prev) => [
        {
          id: res.inviteId,
          type: inviteType,
          role: assignedRole,
          otp: res.otp || otp,
          isRedeemed: false,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ])
    } catch (error) {
      console.error("Failed to create workspace invite:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleCopyOtp = async () => {
    await navigator.clipboard.writeText(createdOtp)
    setCopiedOtp(true)
    setTimeout(() => setCopiedOtp(false), 2000)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto text-xs">
      {/* Create Invite Section */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Create Invite Link
          </h4>
          <p className="text-muted-foreground">
            Generate a single-use share link protected by a 6-digit One-Time PIN (OTP).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">6-Digit One-Time PIN</Label>
              <button
                type="button"
                onClick={handleRegenerateOtp}
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Randomize
              </button>
            </div>
            <Input
              type="text"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit PIN"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-8 text-xs font-mono tracking-widest"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Role Permission</Label>
            <Select
              value={isSessionInvite ? "OWNER" : role}
              onValueChange={(v) => setRole(v as WorkspaceRole)}
              disabled={isSessionInvite}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWNER" className="text-xs">Owner</SelectItem>
                <SelectItem value="EDITOR" className="text-xs">Editor</SelectItem>
                <SelectItem value="VIEWER" className="text-xs">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Checkbox for New User Session */}
        <div className="flex items-center space-x-2 pt-1">
          <Checkbox
            id="session-invite"
            checked={isSessionInvite}
            onCheckedChange={(checked) => setIsSessionInvite(Boolean(checked))}
          />
          <Label htmlFor="session-invite" className="text-xs font-normal cursor-pointer">
            Create as new user session (syncs all workspaces across devices)
          </Label>
        </div>

        <Button
          size="sm"
          onClick={handleGenerateLink}
          disabled={otp.length !== 6 || isCreating}
          className="text-xs w-full sm:w-auto"
        >
          {isCreating ? "Generating..." : "Generate Link"}
        </Button>

        {inviteUrl && (
          <div className="space-y-3 pt-3 border-t">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Shareable Invite Link</Label>
              <div className="flex items-center gap-2">
                <Input value={inviteUrl} readOnly className="h-8 text-xs font-mono flex-1 bg-muted" />
                <Button size="sm" variant="outline" onClick={handleCopyLink} className="h-8 text-xs gap-1">
                  {copiedLink ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedLink ? "Copied" : "Copy Link"}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Required Verification OTP</Label>
              <div className="flex items-center gap-2">
                <Input value={createdOtp} readOnly className="h-8 text-xs font-mono tracking-widest w-32 bg-muted font-bold" />
                <Button size="sm" variant="outline" onClick={handleCopyOtp} className="h-8 text-xs gap-1">
                  {copiedOtp ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedOtp ? "Copied" : "Copy OTP"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generated Invites List */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Workspace Invites
        </h4>
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-[11px]">No invites generated in this session.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{inv.id.slice(0, 8)}...</span>
                    <Badge variant={inv.type === "SESSION" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                      {inv.type}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {inv.role}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">OTP: {inv.otp} • Created at {inv.createdAt}</p>
                </div>
                <div>
                  {inv.isRedeemed ? (
                    <Badge variant="secondary" className="text-[10px] text-green-600 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Redeemed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-600">
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active User Sessions */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Active User Sessions
        </h4>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.deviceId} className="flex items-center justify-between p-2 rounded bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="font-medium flex items-center gap-2">
                    Device ({session.deviceId.slice(0, 8)}...)
                    {session.isCurrent && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        This Device
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">{session.lastActive}</p>
                </div>
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
          ))}
        </div>
      </div>
    </div>
  )
}