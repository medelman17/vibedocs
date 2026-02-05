"use client"

import * as React from "react"
import Image from "next/image"
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
  FileText,
  Trash2Icon,
  MoreHorizontalIcon,
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
  onDeleteItem?: (item: HistoryItem) => void
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
  onDeleteItem,
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
        {/* Logo/Brand */}
        <div className={cn(
          "flex items-center gap-2 px-2 py-1",
          isCollapsed && "justify-center"
        )}>
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary"
          >
            <FileText className="size-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <span className="text-sm font-semibold tracking-tight">VibeDocs</span>
          )}
        </div>

        <SidebarSeparator className="my-2" />

        {/* Actions */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onNewChat}
              tooltip="New Chat"
              className="gap-2"
            >
              <PlusIcon className="size-4 shrink-0" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onOpenCommandPalette}
              tooltip="Search (⌘K)"
              className="gap-2"
            >
              <SearchIcon className="size-4 shrink-0" />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {/* Hide history items when collapsed - they don't make sense as icons */}
        {!isCollapsed && (
          <>
            {groupedItems.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = getIcon(item.type)
                      return (
                        <SidebarMenuItem key={item.id}>
                          <div className="group/item relative flex w-full items-center">
                            <SidebarMenuButton
                              onClick={() => onSelectItem?.(item)}
                              tooltip={item.title}
                              className="flex-1"
                            >
                              <Icon className="size-4" />
                              <span>{item.title}</span>
                            </SidebarMenuButton>
                            {item.type === "conversation" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="absolute right-1 opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition-opacity p-1 hover:bg-accent rounded-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontalIcon className="size-3.5" />
                                    <span className="sr-only">More options</span>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    onClick={() => onDeleteItem?.(item)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2Icon className="mr-2 size-4" />
                                    Delete conversation
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {groupedItems.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No history yet
              </div>
            )}
          </>
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
                    <BuildingIcon className="size-4 shrink-0" />
                    {!isCollapsed && (
                      <>
                        <span className="truncate">{currentOrg?.name || "Select org"}</span>
                        <ChevronDownIcon className="ml-auto size-4 shrink-0" />
                      </>
                    )}
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
                    <Image
                      src={user.avatar}
                      alt={user.name || "User avatar"}
                      width={24}
                      height={24}
                      className="size-6 shrink-0 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                      style={{
                        background: "oklch(0.90 0.08 293)",
                        color: "oklch(0.50 0.24 293)",
                      }}
                    >
                      {user?.name?.charAt(0) || "U"}
                    </div>
                  )}
                  {!isCollapsed && (
                    <div className="flex min-w-0 flex-col items-start text-left">
                      <span className="truncate text-sm font-medium">
                        {user?.name || "Guest"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </div>
                  )}
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
