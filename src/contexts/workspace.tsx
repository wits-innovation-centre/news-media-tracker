import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { initializeDatabase } from "@/lib/db/client"
import {
    createWorkspace as createWorkspaceRecord,
    deleteWorkspace as deleteWorkspaceRecord,
    ensureInitialWorkspace,
    listWorkspaces,
    renameWorkspace as renameWorkspaceRecord,
    setWorkspaceTemplateGroup as setWorkspaceTemplateGroupRecord,
    touchWorkspace,
} from "@/lib/db/utils"
import type { WorkspaceRecord } from "@/lib/types"
import { DEFAULT_WORKSPACE_ICON } from "@/lib/db/utils"

const ACTIVE_WORKSPACE_STORAGE_KEY = "active_workspace_id"
const FALLBACK_WORKSPACE_TIMESTAMP = 0

interface WorkspaceContextValue {
    activeWorkspace: WorkspaceRecord
    workspaces: WorkspaceRecord[]
    isReady: boolean
    createWorkspace: (name: string, description?: string) => Promise<WorkspaceRecord>
    renameWorkspace: (workspaceId: string, name: string, description?: string) => Promise<void>
    setWorkspaceTemplateGroup: (workspaceId: string, templateGroupId?: string) => Promise<void>
    switchWorkspace: (workspaceId: string) => Promise<void>
    deleteWorkspace: (workspaceId: string) => Promise<void>
    refreshWorkspaces: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const getStoredWorkspaceId = () => {
    if (typeof window === "undefined") return undefined
    return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ?? undefined
}

function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("default")
    const [isReady, setIsReady] = useState(false)

    const refreshWorkspaces = useCallback(async () => {
        const records = await listWorkspaces()
        setWorkspaces(records)
    }, [])

    useEffect(() => {
        void (async () => {
            await initializeDatabase()
            const initialWorkspace = await ensureInitialWorkspace()
            const records = await listWorkspaces()

            const storedWorkspaceId = getStoredWorkspaceId()
            const storedWorkspaceExists = storedWorkspaceId
                ? records.some((workspace) => workspace.id === storedWorkspaceId)
                : false

            const initialWorkspaceId = storedWorkspaceExists
                ? String(storedWorkspaceId)
                : initialWorkspace.id

            setWorkspaces(records)
            setActiveWorkspaceId(initialWorkspaceId)
            await touchWorkspace(initialWorkspaceId)
            localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, initialWorkspaceId)
            setIsReady(true)
        })()
    }, [])

    const createWorkspace = useCallback(async (name: string, description?: string) => {
        const created = await createWorkspaceRecord(name, description)
        await refreshWorkspaces()
        await touchWorkspace(created.id)
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, created.id)
        setActiveWorkspaceId(created.id)
        return created
    }, [refreshWorkspaces])

    const renameWorkspace = useCallback(async (workspaceId: string, name: string, description?: string) => {
        await renameWorkspaceRecord(workspaceId, name, description)
        await refreshWorkspaces()
    }, [refreshWorkspaces])

    const switchWorkspace = useCallback(async (workspaceId: string) => {
        await touchWorkspace(workspaceId)
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
        setActiveWorkspaceId(workspaceId)
        await refreshWorkspaces()
    }, [refreshWorkspaces])

    const setWorkspaceTemplateGroup = useCallback(async (workspaceId: string, templateGroupId?: string) => {
        await setWorkspaceTemplateGroupRecord(workspaceId, templateGroupId)
        await refreshWorkspaces()
    }, [refreshWorkspaces])

    const deleteWorkspace = useCallback(async (workspaceId: string) => {
        await deleteWorkspaceRecord(workspaceId)
        const nextWorkspaces = await listWorkspaces()
        const fallback = nextWorkspaces[0]

        setWorkspaces(nextWorkspaces)
        if (activeWorkspaceId === workspaceId && fallback) {
            await touchWorkspace(fallback.id)
            localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fallback.id)
            setActiveWorkspaceId(fallback.id)
        }
    }, [activeWorkspaceId])

    const activeWorkspace = useMemo(() => {
        return workspaces.find((workspace) => workspace.id === activeWorkspaceId)
            ?? workspaces[0]
            ?? {
            id: "default",
            name: "Homicide Tracker",
            description: "Default workspace set up to track reported incidents of homicide.",
            icon_path: DEFAULT_WORKSPACE_ICON,
            created_at: FALLBACK_WORKSPACE_TIMESTAMP,
            last_accessed_at: FALLBACK_WORKSPACE_TIMESTAMP,
            template_group_id: "homicide-tracker"
        }
    }, [activeWorkspaceId, workspaces])

    const value = useMemo<WorkspaceContextValue>(() => ({
        activeWorkspace,
        workspaces,
        isReady,
        createWorkspace,
        renameWorkspace,
        setWorkspaceTemplateGroup,
        switchWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
    }), [
        activeWorkspace,
        workspaces,
        isReady,
        createWorkspace,
        renameWorkspace,
        setWorkspaceTemplateGroup,
        switchWorkspace,
        deleteWorkspace,
        refreshWorkspaces,
    ])

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function useWorkspace() {
    const context = useContext(WorkspaceContext)
    if (!context) {
        throw new Error("useWorkspace must be used within a WorkspaceProvider")
    }
    return context
}

export { WorkspaceProvider, useWorkspace }
