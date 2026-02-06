"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  FileText,
  MessageSquareIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  LogOutIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOutAction } from "@/app/(main)/(auth)/actions"

// ============================================================================
// Types
// ============================================================================

export interface AnalysisShellUser {
  id: string
  name: string
  email: string
  avatar?: string
}

interface AnalysisShellProps {
  children: React.ReactNode
  user: AnalysisShellUser
  userRole: string
}

// ============================================================================
// Nav Sidebar (icon-rail focused)
// ============================================================================

function NavSidebar({ user, userRole: _userRole }: { user: AnalysisShellUser; userRole: string }) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const handleSignOut = async () => {
    await signOutAction()
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className={cn("flex items-center gap-2 px-2 py-1", isCollapsed && "justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <FileText className="size-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <span className="text-sm font-semibold tracking-tight">VibeDocs</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard">
                  <Link href="/analyses">
                    <LayoutDashboardIcon className="size-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Chat">
                  <Link href="/chat">
                    <MessageSquareIcon className="size-4" />
                    <span>Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* User menu */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user.name}>
                  {user.avatar ? (
                    <Image
                      src={user.avatar}
                      alt={user.name}
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
                      {user.name.charAt(0)}
                    </div>
                  )}
                  {!isCollapsed && (
                    <div className="flex min-w-0 flex-col items-start text-left">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isCollapsed ? "right" : "top"} align="start" className="w-56">
                <DropdownMenuItem>
                  <SettingsIcon className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
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

// ============================================================================
// AnalysisShell
// ============================================================================

export function AnalysisShell({ children, user, userRole }: AnalysisShellProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <NavSidebar user={user} userRole={userRole} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {/* Thin header — just sidebar trigger */}
          <header className="flex h-10 shrink-0 items-center border-b px-2">
            <SidebarTrigger className="-ml-0.5" />
          </header>

          {/* Content fills remaining space */}
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
