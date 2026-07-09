import './App.css'
import { useState } from "react"
import { Capture, type FieldDefinition } from "@/components/ui/custom/capture"
import { SettingsModal } from "@/components/ui/custom/settings-modal"
import { exportSqliteToObsidianWorkspace } from "@/lib/utils"

function App() {
  const [activeSchema, setActiveSchema] = useState<FieldDefinition[]>([
    { name: "title", label: "Document Name", type: "string", required: true },
    { name: "content", label: "Markdown Core Editor", type: "markdown" }
  ])

  const handleCaptureSubmit = async (frontmatter: Record<string, any>, body: string) => {
    const documentTitle = (frontmatter.title as string) || `Untitled_${Date.now()}`
    
    console.log("Writing payload to SQLite via OPFS sync hooks...")
    // Example: await db.execute("INSERT INTO notes ... ", [documentTitle, JSON.stringify(frontmatter), body])
  }

  const triggerObsidianVaultExport = async () => {
    const mockNotesFromDb = [
      { title: "Refactoring Thoughts", frontmatter: JSON.stringify({ rating: 5, draft: false }), body: "# Architecture\n This is my local text notes content." }
    ]

    await exportSqliteToObsidianWorkspace(mockNotesFromDb)
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground flex p-8">
      <SettingsModal 
        userSchemas={[]} 
        onSaveSchema={(name, fields) => console.log("Save new schema type", name)} 
        onDeleteSchema={(id) => console.log("Delete schema type ID", id)} 
        onExportToObsidian={triggerObsidianVaultExport}
      />

      <main className="max-w-2xl mx-auto w-full space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Capture Engine</h1>
        <Capture fields={activeSchema} onSubmit={handleCaptureSubmit} />
      </main>
    </div>
  )
};

export default App;