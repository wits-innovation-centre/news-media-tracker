import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/contexts/workspace-context";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </WorkspaceProvider>
  </StrictMode>,
)
