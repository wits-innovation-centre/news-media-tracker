import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import JSZip from "jszip"
import type { TieredOptions } from "@/lib/types";

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

function evaluateVisibility(
  condition: any,
  formValues: Record<string, any>
): boolean {
  if (!condition) return true; // No condition means always visible

  const targetValue = formValues[condition.dependsOn];

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

export {
  cn,
  exportSqliteToObsidianWorkspace,
  isValidPathInRecord,
  evaluateVisibility
}