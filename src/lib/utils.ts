import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import JSZip from "jszip"
// import { type FieldDefinition } from "@/components/ui/custom/capture"

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

  // APPROACH A: Modern File System Access API (Chrome / Edge / Opera)
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

  // APPROACH B: Universal Fallback (Safari, Firefox, Mobile)
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
}

export {
  cn,
  exportSqliteToObsidianWorkspace
}