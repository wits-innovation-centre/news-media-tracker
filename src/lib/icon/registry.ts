import {
    FilePlus2,
    FolderTree,
    MapPin,
    Newspaper,
    Shield,
    Tag,
    UserRound,
    Users,
    type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/types";

const ICON_COMPONENTS: Record<IconName, LucideIcon> = {
    "file-plus-2": FilePlus2,
    newspaper: Newspaper,
    users: Users,
    "user-round": UserRound,
    "map-pin": MapPin,
    tag: Tag,
    shield: Shield,
    "folder-tree": FolderTree,
};

const DEFAULT_ICON_NAME: IconName = "file-plus-2";

const resolveIcon = (iconName?: IconName): LucideIcon => {
    if (!iconName) return ICON_COMPONENTS[DEFAULT_ICON_NAME];
    return ICON_COMPONENTS[iconName] ?? ICON_COMPONENTS[DEFAULT_ICON_NAME];
};

const AVAILABLE_ICON_NAMES = Object.keys(ICON_COMPONENTS) as IconName[];
const DEFAULT_WORKSPACE_ICON = "/icons/homicide-tracker.png";

export {
  DEFAULT_ICON_NAME,
  AVAILABLE_ICON_NAMES,
  DEFAULT_WORKSPACE_ICON,

  resolveIcon
}