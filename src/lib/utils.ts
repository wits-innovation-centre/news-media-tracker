import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import JSZip from "jszip"
import type { FieldDefinition, TieredOptions } from "@/lib/types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface SQLiteNoteRecord {
  title: string
  frontmatter: string
  body: string
}

function convertToYamlFrontmatter(data: Record<string, any>): string {
  const entries = Object.entries(data)
  if (entries.length === 0) return ""
  const yamlLines = entries.map(([key, value]) => `${key}: ${typeof value === "string" && (value.includes(":") || value.includes("#")) ? `"${value.replace(/"/g, '\\"')}"` : value}`)
  return `---\n${yamlLines.join("\n")}\n---\n\n`
}

async function exportSqliteToObsidianWorkspace(notes: SQLiteNoteRecord[]) {
  const getSafeName = (title: string) => `${title.replace(/[/\\?%*:|"<>\s]/g, "_")}.md`

  if ("showDirectoryPicker" in window && typeof window.showDirectoryPicker === "function") {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" })

    for (const note of notes) {
      const fileContents = `${convertToYamlFrontmatter(JSON.parse(note.frontmatter))}${note.body}`
      const fileHandle = await directoryHandle.getFileHandle(getSafeName(note.title), { create: true })
      const writableStream = await fileHandle.createWritable()
      await writableStream.write(fileContents)
      await writableStream.close()
    }
    return
  }

  console.warn("showDirectoryPicker unsupported. Falling back to ZIP compilation.")
  const zip = new JSZip()

  for (const note of notes) {
    const fileContents = `${convertToYamlFrontmatter(JSON.parse(note.frontmatter))}${note.body}`
    zip.file(getSafeName(note.title), fileContents)
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })

  const downloadLink = document.createElement("a")
  downloadLink.href = URL.createObjectURL(zipBlob)
  downloadLink.download = `obsidian_vault_${Date.now()}.zip`
  document.body.appendChild(downloadLink)
  downloadLink.click()
  document.body.removeChild(downloadLink)
  URL.revokeObjectURL(downloadLink.href)
};

function isValidPathInRecord(path: string[], record: TieredOptions): boolean {
  if (path.length === 0) return false;

  const [currentSegment, ...remainingSegments] = path;

  if (currentSegment.startsWith("$")) return false;

  const nextTarget = record[currentSegment];
  if (!nextTarget) return false;

  if (remainingSegments.length === 0) {
    return Array.isArray(nextTarget) || typeof nextTarget === "object";
  }

  if (Array.isArray(nextTarget)) {
    return remainingSegments.length === 1 && nextTarget.includes(remainingSegments[0]);
  }

  return isValidPathInRecord(remainingSegments, nextTarget as TieredOptions);
};

function flattenTieredOptions(record: TieredOptions, prefix: string[] = []): string[] {
  return Object.entries(record).flatMap(([key, value]) => {
    if (key.startsWith("$")) return []

    const nextPath = [...prefix, key]

    if (Array.isArray(value)) {
      return value.map((leaf) => [...nextPath, leaf].join(" / "))
    }

    return flattenTieredOptions(value as TieredOptions, nextPath)
  })
}

function getVisibilityTargetValue(formValues: Record<string, any>, dependsOn: string): any {
  if (dependsOn in formValues) return formValues[dependsOn]

  const segments = dependsOn.split(".")
  if (segments.length === 0) return undefined

  const rootValue = formValues[segments[0]]
  if (rootValue == null) return undefined

  if (typeof rootValue === "string" && rootValue.includes(" / ") && segments.length > 1) {
    const pathSegments = rootValue.split(" / ")
    return pathSegments[pathSegments.length - 1]
  }

  return segments.slice(1).reduce((current, segment) => {
    if (current == null || typeof current !== "object") return undefined
    return current[segment]
  }, rootValue)
}

function evaluateVisibility(
  condition: any,
  formValues: Record<string, any>
): boolean {
  if (!condition) return true; // No condition means always visible

  const targetValue = getVisibilityTargetValue(formValues, condition.dependsOn);

  switch (condition.operator) {
    case "eq":
      return targetValue === condition.value;
    case "neq":
      return targetValue !== condition.value;
    case "includes":
      return Array.isArray(targetValue) ? targetValue.includes(condition.value) : false;
    case "notEmpty":
      return targetValue !== undefined && targetValue !== null && targetValue !== "";
    default:
      return true;
  }
}

function buildRandomToken(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("")
}

function formatDateToken(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  return `${year}${month}${day}`
}

function generateFieldValue(field: FieldDefinition, formValues: Record<string, any> = {}): any {
  if (field.generator) {
    const { strategy, prefix = "", pattern, randomLength = 6, uppercase } = field.generator

    let generatedValue = ""

    switch (strategy) {
      case "uuid":
        generatedValue = crypto.randomUUID()
        break
      case "timestamp":
        generatedValue = `${Date.now()}`
        break
      case "pattern":
        generatedValue = (pattern ?? "{uuid}").replace(/\{([^}]+)\}/g, (_match, token) => {
          if (token === "uuid") return crypto.randomUUID()
          if (token === "timestamp") return `${Date.now()}`
          if (token === "date") return formatDateToken()
          if (token === "rand" || token === "random") return buildRandomToken(randomLength)
          if (token.startsWith("rand:")) {
            const length = Number.parseInt(token.split(":")[1] ?? `${randomLength}`, 10)
            return buildRandomToken(Number.isNaN(length) ? randomLength : length)
          }
          if (token.startsWith("field:")) {
            const fieldName = token.slice("field:".length)
            const value = formValues[fieldName]
            return value == null ? "" : String(value)
          }
          return ""
        })
        break
    }

    const value = `${prefix}${generatedValue}`
    return uppercase ? value.toUpperCase() : value
  }

  if (field.default !== undefined) return field.default

  if (field.type.data === "boolean") return false
  if (field.type.data === "number") return 0
  if (field.type.data === "array<string>") return []

  return ""
}

export {
  cn,
  exportSqliteToObsidianWorkspace,
  isValidPathInRecord,
  flattenTieredOptions,
  evaluateVisibility,
  generateFieldValue
}