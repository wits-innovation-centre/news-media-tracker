// src/components/ui/custom/modal-stack-header.tsx
import React from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ModalScreen } from "@/hooks/use-modal-stack"

interface ModalStackHeaderProps {
  stack: ModalScreen[]
  onBack: () => void
  onClose: () => void
}

export function ModalStackHeader({ stack, onBack, onClose }: ModalStackHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-2">
        {stack.length > 1 && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Go back</span>
          </Button>
        )}
        <nav className="flex items-center space-x-1.5 text-sm">
          {stack.map((screen, index) => {
            const isLast = index === stack.length - 1
            return (
              <React.Fragment key={screen.id}>
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className={isLast ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {screen.title}
                </span>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </Button>
    </div>
  )
}