// src/hooks/use-modal-stack.ts
import { useState } from "react"

export interface ModalScreen {
  id: string
  title: string
  content: React.ReactNode
}

export function useModalStack(initialScreen: ModalScreen) {
  const [stack, setStack] = useState<ModalScreen[]>([initialScreen])

  const push = (screen: ModalScreen) => {
    setStack((prev) => [...prev, screen])
  }

  const pop = () => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }

  const reset = () => {
    setStack([initialScreen])
  }

  const currentScreen = stack[stack.length - 1]
  const canGoBack = stack.length > 1

  return {
    stack,
    currentScreen,
    canGoBack,
    push,
    pop,
    reset,
  }
}