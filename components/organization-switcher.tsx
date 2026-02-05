"use client"

/**
 * @fileoverview Organization switcher component
 *
 * Displays the current organization and allows switching between
 * organizations the user belongs to.
 */

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Building2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getUserOrganizations, switchOrganization } from "@/app/actions/organizations"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Organization {
  id: string
  name: string
  slug: string
  role: string
  memberCount: number
}

interface OrganizationSwitcherProps {
  currentOrganizationId?: string
  currentOrganizationName?: string
}

export function OrganizationSwitcher({
  currentOrganizationId,
  currentOrganizationName,
}: OrganizationSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function loadOrganizations() {
      const result = await getUserOrganizations()
      if (result.success) {
        setOrganizations(result.data)
      } else {
        toast.error("Failed to load organizations")
      }
      setLoading(false)
    }
    loadOrganizations()
  }, [])

  const _currentOrg = organizations.find((org) => org.id === currentOrganizationId)

  async function handleSwitch(organizationId: string) {
    if (organizationId === currentOrganizationId) {
      setOpen(false)
      return
    }

    setSwitching(true)
    const result = await switchOrganization(organizationId)

    if (result.success) {
      toast.success("Organization switched")
      setOpen(false)
      router.refresh()
    } else {
      toast.error(result.error.message)
    }
    setSwitching(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select organization"
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {currentOrganizationName || "Select organization"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading..." : "No organizations found."}
            </CommandEmpty>
            <CommandGroup heading="Your Organizations">
              {organizations.map((org) => (
                <CommandItem
                  key={org.id}
                  onSelect={() => handleSwitch(org.id)}
                  disabled={switching}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          currentOrganizationId === org.id
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">{org.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {org.role} · {org.memberCount} member
                          {org.memberCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false)
                  router.push("/settings/organizations/new")
                }}
                className="cursor-pointer"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
