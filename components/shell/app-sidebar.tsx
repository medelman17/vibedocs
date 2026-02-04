"use client"

import * as React from "react"
import {
  PlusIcon,
  SearchIcon,
  MessageSquareIcon,
  FileTextIcon,
  BarChartIcon,
  SettingsIcon,
  LogOutIcon,
  ChevronDownIcon,
  BuildingIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface HistoryItem {
  id: string
  type: "conversation" | "document" | "analysis"
  title: string
  date: Date
  pinned?: boolean
}

export interface Organization {
  id: string
  name: string
  logo?: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

interface AppSidebarProps {
  items?: HistoryItem[]
  organizations?: Organization[]
  currentOrg?: Organization
  user?: User
  onSelectItem?: (item: HistoryItem) => void
  onNewChat?: () => void
  onOpenCommandPalette?: () => void
  onSwitchOrg?: (org: Organization) => void
  onOpenSettings?: () => void
  onSignOut?: () => void
}

export function AppSidebar({
  items = [],
  organizations = [],
  currentOrg,
  user,
  onSelectItem,
  onNewChat,
  onOpenCommandPalette,
  onSwitchOrg,
  onOpenSettings,
  onSignOut,
}: AppSidebarProps) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const groupedItems = React.useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const groups: { label: string; items: HistoryItem[] }[] = [
      { label: "Pinned", items: [] },
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "This Week", items: [] },
      { label: "Older", items: [] },
    ]

    for (const item of items) {
      if (item.pinned) {
        groups[0].items.push(item)
      } else if (item.date >= today) {
        groups[1].items.push(item)
      } else if (item.date >= yesterday) {
        groups[2].items.push(item)
      } else if (item.date >= weekAgo) {
        groups[3].items.push(item)
      } else {
        groups[4].items.push(item)
      }
    }

    return groups.filter((g) => g.items.length > 0)
  }, [items])

  const getIcon = (type: HistoryItem["type"]) => {
    switch (type) {
      case "conversation":
        return MessageSquareIcon
      case "document":
        return FileTextIcon
      case "analysis":
        return BarChartIcon
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onNewChat}
              tooltip="New Chat"
              className="justify-center gap-2"
            >
              <PlusIcon className="size-4" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onOpenCommandPalette}
              tooltip="Search (⌘K)"
              className="justify-center gap-2"
            >
              <SearchIcon className="size-4" />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {groupedItems.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = getIcon(item.type)
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => onSelectItem?.(item)}
                        tooltip={item.title}
                      >
                        <Icon className="size-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {groupedItems.length === 0 && !isCollapsed && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history yet
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        {/* Org switcher */}
        {organizations.length > 1 && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton tooltip={currentOrg?.name || "Switch org"}>
                    <BuildingIcon className="size-4" />
                    <span className="truncate">{currentOrg?.name || "Select org"}</span>
                    <ChevronDownIcon className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={isCollapsed ? "right" : "top"}
                  align="start"
                  className="w-56"
                >
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => onSwitchOrg?.(org)}
                      className={cn(currentOrg?.id === org.id && "bg-accent")}
                    >
                      <BuildingIcon className="mr-2 size-4" />
                      {org.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}

        {/* User menu */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={user?.name || "Account"}
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="size-6 rounded-full"
                    />
                  ) : (
                    <div className="flex size-6 items-center justify-center rounded-full bg-violet-100 text-xs font-medium text-violet-600">
                      {user?.name?.charAt(0) || "U"}
                    </div>
                  )}
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium truncate">
                      {user?.name || "Guest"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isCollapsed ? "right" : "top"}
                align="start"
                className="w-56"
              >
                <DropdownMenuItem onClick={onOpenSettings}>
                  <SettingsIcon className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-red-600">
                  <LogOutIcon className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
