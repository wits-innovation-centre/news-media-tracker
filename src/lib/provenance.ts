import { getOrCreateDeviceId } from "@/lib/archive/client"

const USER_STORAGE_KEY = "app_user_id"

interface MutationActorOverrides {
  userId?: string
  deviceId?: string
}

export function getOrCreateUserId(): string {
  if (typeof window === "undefined") {
    return "system-user"
  }

  let userId = localStorage.getItem(USER_STORAGE_KEY)
  if (!userId) {
    userId = `user-${crypto.randomUUID()}`
    localStorage.setItem(USER_STORAGE_KEY, userId)
  }

  return userId
}

export function getMutationActor(overrides: MutationActorOverrides = {}) {
  return {
    userId: overrides.userId?.trim() || getOrCreateUserId(),
    deviceId: overrides.deviceId?.trim() || getOrCreateDeviceId(),
  }
}