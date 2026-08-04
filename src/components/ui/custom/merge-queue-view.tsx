import { useMemo, useState } from "react"

import type { MergeProposal, MergeResolutionPayload, StoredDocument } from "@/lib/types"

interface MergeQueueViewProps {
  proposals: MergeProposal[]
  documents: Record<string, StoredDocument>
  onApprove: (proposalId: string, resolution: MergeResolutionPayload) => Promise<void> | void
  onReject: (proposalId: string) => Promise<void> | void
  onScanWorkspace: () => Promise<void> | void
  isScanning: boolean
}

interface MergeDraft {
  title: string
  frontmatter: Record<string, unknown>
  body: string
}

const safeParseObject = (value: string | null | undefined) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const stringifyValue = (value: unknown) => {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

const parseMetadata = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return JSON.parse(value) as { similarityScore?: number; matchReasons?: string[] }
  } catch {
    return null
  }
}

function MergeQueueView({ proposals, documents, onApprove, onReject, onScanWorkspace, isScanning }: MergeQueueViewProps) {
  const [drafts, setDrafts] = useState<Record<string, MergeDraft>>({})

  const proposalData = useMemo(() => proposals.map((proposal) => {
    const primaryFrontmatter = safeParseObject(proposal.base_frontmatter)
    const secondaryFrontmatter = safeParseObject(proposal.secondary_base_frontmatter)
    const proposedFrontmatter = safeParseObject(proposal.proposed_frontmatter)
    const fieldNames = [...new Set([...Object.keys(primaryFrontmatter), ...Object.keys(secondaryFrontmatter), ...Object.keys(proposedFrontmatter)])].filter(
      (key) => stringifyValue(primaryFrontmatter[key]) !== stringifyValue(secondaryFrontmatter[key])
    )

    return {
      proposal,
      metadata: parseMetadata(proposal.metadata),
      primaryDocument: documents[proposal.document_id],
      secondaryDocument: proposal.secondary_document_id ? documents[proposal.secondary_document_id] : undefined,
      primaryFrontmatter,
      secondaryFrontmatter,
      fieldNames,
    }
  }), [documents, proposals])

  const getDraft = (proposal: MergeProposal): MergeDraft => {
    const existing = drafts[proposal.id]
    if (existing) return existing
    return {
      title: proposal.proposed_title,
      frontmatter: safeParseObject(proposal.proposed_frontmatter),
      body: proposal.proposed_body,
    }
  }

  const updateDraft = (proposalId: string, updater: (current: MergeDraft) => MergeDraft) => {
    setDrafts((current) => {
      const base = current[proposalId] ?? { title: "", frontmatter: {}, body: "" }
      return { ...current, [proposalId]: updater(base) }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/40 p-4">
        <div>
          <h1 className="text-lg font-semibold">Merge Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review duplicate candidates, choose winning values field by field, and reconcile dependent records.</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
          onClick={() => void onScanWorkspace()}
          disabled={isScanning}
        >
          {isScanning ? "Scanning..." : "Scan Workspace"}
        </button>
      </div>

      {proposalData.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No duplicate candidates are currently queued.</div>
      ) : proposalData.map(({ proposal, metadata, primaryDocument, secondaryDocument, primaryFrontmatter, secondaryFrontmatter, fieldNames }) => {
        const draft = getDraft(proposal)

        return (
          <article key={proposal.id} className="space-y-4 rounded-2xl border border-border/70 bg-card/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{proposal.entity_type ?? "documents"} duplicate candidate</div>
                <div className="mt-1 text-xs text-muted-foreground">Similarity score {(proposal.similarity_score ?? metadata?.similarityScore ?? 0).toFixed(2)}</div>
                {metadata?.matchReasons?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {metadata.matchReasons.map((reason) => (
                      <span key={`${proposal.id}-${reason}`} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{reason}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent" onClick={() => void onReject(proposal.id)}>
                  Reject
                </button>
                <button type="button" className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground" onClick={() => void onApprove(proposal.id, draft)}>
                  Merge Records
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary</div>
                <div className="text-sm font-medium">{primaryDocument?.title ?? proposal.proposed_title}</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{stringifyValue(primaryFrontmatter)}</pre>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duplicate</div>
                <div className="text-sm font-medium">{secondaryDocument?.title ?? proposal.secondary_document_id}</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{stringifyValue(secondaryFrontmatter)}</pre>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merged Title</label>
                <div className="mb-2 flex gap-2">
                  <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, title: primaryDocument?.title ?? proposal.proposed_title }))}>
                    Use Primary
                  </button>
                  <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, title: secondaryDocument?.title ?? proposal.proposed_title }))}>
                    Use Duplicate
                  </button>
                </div>
                <input value={draft.title} onChange={(event) => updateDraft(proposal.id, (current) => ({ ...current, title: event.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field Resolution</div>
                {fieldNames.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No conflicting frontmatter fields were detected for this pair.</div>
                ) : fieldNames.map((fieldName) => (
                  <div key={`${proposal.id}-${fieldName}`} className="rounded-lg border border-border/60 p-3">
                    <div className="mb-2 text-sm font-medium">{fieldName}</div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <pre className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap">{stringifyValue(primaryFrontmatter[fieldName]) || "No value"}</pre>
                      <pre className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap">{stringifyValue(secondaryFrontmatter[fieldName]) || "No value"}</pre>
                      <div className="flex flex-col gap-2">
                        <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, frontmatter: { ...current.frontmatter, [fieldName]: primaryFrontmatter[fieldName] } }))}>
                          Use Left
                        </button>
                        <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, frontmatter: { ...current.frontmatter, [fieldName]: secondaryFrontmatter[fieldName] } }))}>
                          Use Right
                        </button>
                      </div>
                    </div>
                    <textarea value={stringifyValue(draft.frontmatter[fieldName])} onChange={(event) => updateDraft(proposal.id, (current) => ({ ...current, frontmatter: { ...current.frontmatter, [fieldName]: event.target.value } }))} className="mt-3 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono" />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merged Body</label>
                <div className="mb-2 flex gap-2">
                  <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, body: proposal.base_body ?? current.body }))}>
                    Use Primary Body
                  </button>
                  <button type="button" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent" onClick={() => updateDraft(proposal.id, (current) => ({ ...current, body: proposal.secondary_base_body ?? current.body }))}>
                    Use Duplicate Body
                  </button>
                </div>
                <textarea value={draft.body} onChange={(event) => updateDraft(proposal.id, (current) => ({ ...current, body: event.target.value }))} className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export { MergeQueueView }