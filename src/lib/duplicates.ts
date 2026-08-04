import { dbClient } from "@/lib/db/client"
import { loadCapturedDocuments, proposeDuplicateMerge } from "@/lib/db/utils"
import type { DuplicateDetectionMetadata, StoredDocument } from "@/lib/types"

interface DuplicateDetectionResult {
  flagged: number
  inspected: number
}

interface CandidateScore {
  score: number
  entityType: string
  reasons: string[]
  fieldScores: Record<string, number>
}

const ARTICLE_SCHEMAS = new Set(["article", "articles", "news_report", "report"])
const EVENT_SCHEMAS = new Set(["event", "events", "incident"])
const PARTICIPANT_SCHEMAS = new Set(["participant", "participants", "victim", "person"])

const normalizeText = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim()

const normalizeDate = (value: unknown) => String(value ?? "").slice(0, 10)

const isEmptyValue = (value: unknown) => {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array(right.length + 1).fill(0)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      )
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex]
    }
  }

  return previous[right.length]
}

const stringSimilarity = (leftValue: unknown, rightValue: unknown) => {
  const left = normalizeText(leftValue)
  const right = normalizeText(rightValue)
  if (!left || !right) return 0
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) return 1
  return 1 - levenshteinDistance(left, right) / maxLength
}

const resolveEntityType = (document: StoredDocument) => {
  const schemaId = normalizeText(document.schema_id)
  if (ARTICLE_SCHEMAS.has(schemaId)) return "articles"
  if (EVENT_SCHEMAS.has(schemaId)) return "events"
  if (PARTICIPANT_SCHEMAS.has(schemaId)) return "participants"
  if (normalizeText(document.frontmatter.role).includes("victim")) return "participants"
  if (document.frontmatter.url || document.frontmatter.headline) return "articles"
  if (document.frontmatter.incident_date || document.frontmatter.location) return "events"
  return "documents"
}

const getSignal = (document: StoredDocument) => ({
  title: document.title || document.frontmatter.title || document.frontmatter.headline || document.frontmatter.name,
  headline: document.frontmatter.headline || document.frontmatter.title || document.title,
  name: document.frontmatter.victim_name || document.frontmatter.full_name || document.frontmatter.name || document.title,
  date: document.frontmatter.incident_date || document.frontmatter.event_date || document.frontmatter.date || document.frontmatter.published_at,
  location: document.frontmatter.location || document.frontmatter.incident_location || document.frontmatter.city || document.frontmatter.place,
  url: document.frontmatter.url || document.frontmatter.source_url,
})

const computeCompleteness = (document: StoredDocument) => {
  const populatedFields = Object.values(document.frontmatter).filter((value) => !isEmptyValue(value)).length
  return populatedFields * 10 + document.body.trim().length + document.title.trim().length
}

const chooseValue = (left: unknown, right: unknown) => {
  if (isEmptyValue(left)) return right
  if (isEmptyValue(right)) return left
  if (Array.isArray(left) || Array.isArray(right)) {
    return [...new Set([...(Array.isArray(left) ? left : [left]), ...(Array.isArray(right) ? right : [right])].map((value) => String(value).trim()).filter(Boolean))]
  }
  if (typeof left === "string" && typeof right === "string") {
    return left.trim().length >= right.trim().length ? left : right
  }
  return left
}

const mergeFrontmatter = (primary: StoredDocument, duplicate: StoredDocument) => {
  const merged: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(primary.frontmatter), ...Object.keys(duplicate.frontmatter)])
  keys.forEach((key) => {
    merged[key] = chooseValue(primary.frontmatter[key], duplicate.frontmatter[key])
  })
  return merged
}

const scoreDuplicatePair = (left: StoredDocument, right: StoredDocument): CandidateScore | null => {
  const leftType = resolveEntityType(left)
  const rightType = resolveEntityType(right)
  if (leftType !== rightType) return null

  const leftSignal = getSignal(left)
  const rightSignal = getSignal(right)
  const titleScore = stringSimilarity(leftSignal.title, rightSignal.title)
  const headlineScore = stringSimilarity(leftSignal.headline, rightSignal.headline)
  const nameScore = stringSimilarity(leftSignal.name, rightSignal.name)
  const locationScore = stringSimilarity(leftSignal.location, rightSignal.location)
  const dateMatch = normalizeDate(leftSignal.date) && normalizeDate(leftSignal.date) === normalizeDate(rightSignal.date) ? 1 : 0
  const exactUrlMatch = normalizeText(leftSignal.url) && normalizeText(leftSignal.url) === normalizeText(rightSignal.url) ? 1 : 0

  const fieldScores = { title: titleScore, headline: headlineScore, name: nameScore, location: locationScore, date: dateMatch, url: exactUrlMatch }
  let score = 0
  const reasons: string[] = []

  if (exactUrlMatch) {
    score += 0.5
    reasons.push("identical source URL")
  }
  if (dateMatch) {
    score += 0.2
    reasons.push("matching incident date")
  }
  if (headlineScore >= 0.84) {
    score += 0.3
    reasons.push("headline similarity")
  }
  if (nameScore >= 0.9) {
    score += 0.35
    reasons.push("victim or participant name similarity")
  }
  if (locationScore >= 0.8) {
    score += 0.15
    reasons.push("matching location")
  }
  if (titleScore >= 0.9) {
    score += 0.15
    reasons.push("title similarity")
  }

  const threshold = leftType === "articles" ? 0.72 : leftType === "participants" ? 0.7 : leftType === "events" ? 0.68 : 0.85
  if (score < threshold || reasons.length === 0) return null

  return { score: Math.min(0.99, Number(score.toFixed(4))), entityType: leftType, reasons, fieldScores }
}

const choosePrimaryDocument = (left: StoredDocument, right: StoredDocument) => computeCompleteness(left) >= computeCompleteness(right) ? left : right

const buildMergedRecord = (primary: StoredDocument, duplicate: StoredDocument) => ({
  title: String(chooseValue(primary.title, duplicate.title) ?? primary.title ?? duplicate.title ?? "Untitled"),
  frontmatter: mergeFrontmatter(primary, duplicate),
  body: String(chooseValue(primary.body, duplicate.body) ?? primary.body ?? duplicate.body ?? ""),
})

const hasExistingProposal = async (workspaceId: string, leftId: string, rightId: string) => {
  const existing = await dbClient.query(
    `SELECT id
     FROM merge_queue
     WHERE workspace_id = ?
       AND action = 'MERGE_DUPLICATE'
       AND status IN ('pending', 'approved')
       AND (
         (document_id = ? AND secondary_document_id = ?)
         OR (document_id = ? AND secondary_document_id = ?)
       )
     LIMIT 1`,
    [workspaceId, leftId, rightId, rightId, leftId]
  )

  return existing.length > 0
}

const flagPair = async (workspaceId: string, left: StoredDocument, right: StoredDocument) => {
  const candidate = scoreDuplicatePair(left, right)
  if (!candidate) return false
  if (await hasExistingProposal(workspaceId, left.id, right.id)) return false

  const primary = choosePrimaryDocument(left, right)
  const duplicate = primary.id === left.id ? right : left
  const merged = buildMergedRecord(primary, duplicate)
  const metadata: DuplicateDetectionMetadata = {
    similarityScore: candidate.score,
    matchReasons: candidate.reasons,
    fieldScores: candidate.fieldScores,
  }

  await proposeDuplicateMerge(primary, duplicate, merged.title, merged.frontmatter, merged.body, "system:duplicate-detector", metadata, candidate.entityType)
  return true
}

export async function detectPotentialDuplicatesForWorkspace(workspaceId: string): Promise<DuplicateDetectionResult> {
  const documents = await loadCapturedDocuments(workspaceId)
  let flagged = 0
  let inspected = 0

  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < documents.length; rightIndex += 1) {
      inspected += 1
      if (await flagPair(workspaceId, documents[leftIndex], documents[rightIndex])) flagged += 1
    }
  }

  return { flagged, inspected }
}

export async function detectPotentialDuplicatesForDocument(documentId: string, workspaceId: string): Promise<DuplicateDetectionResult> {
  const documents = await loadCapturedDocuments(workspaceId)
  const seed = documents.find((document) => document.id === documentId)
  if (!seed) return { flagged: 0, inspected: 0 }

  let flagged = 0
  let inspected = 0
  for (const candidate of documents) {
    if (candidate.id === seed.id) continue
    inspected += 1
    if (await flagPair(workspaceId, seed, candidate)) flagged += 1
  }

  return { flagged, inspected }
}