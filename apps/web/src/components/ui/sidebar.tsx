import * as React from "react"
import { PanelLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const _SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const _SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3.25rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContext = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [openMobile, setOpenMobile] = React.useState(false)

  // Internal open state
  const [_open, _setOpen] = React.useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SIDEBAR_COOKIE_NAME)
      if (saved !== null) return saved === "true"
    }
    return defaultOpen
  })

  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }
      try {
        localStorage.setItem(SIDEBAR_COOKIE_NAME, String(openState))
      } catch {}
    },
    [setOpenProp, open]
  )

  // Listen to screen resize for mobile breakpoint
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Keyboard shortcut (Cmd/Ctrl + B)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        if (isMobile) {
          setOpenMobile((prev) => !prev)
        } else {
          setOpen((prev) => !prev)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMobile, setOpen])

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((prev) => !prev) : setOpen((prev) => !prev)
  }, [isMobile, setOpen])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContext>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-screen w-full has-[[data-variant=inset]]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "icon",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "flex h-full w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    if (!openMobile) return null
    return (
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
          onClick={() => setOpenMobile(false)}
        />
        {/* Drawer content */}
        <div
          data-mobile="true"
          className={cn(
            "relative flex h-full w-[var(--sidebar-width)] max-w-[85vw] flex-col border-r border-border bg-card text-foreground shadow-2xl z-50",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      className={cn(
        "group peer hidden lg:block text-sidebar-foreground select-none transition-all duration-200 ease-in-out shrink-0",
        state === "collapsed"
          ? "w-[var(--sidebar-width-icon)]"
          : "w-[var(--sidebar-width)]",
        className
      )}
    >
      <div
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        className={cn(
          "fixed top-12 bottom-0 left-0 z-30 flex flex-col border-r border-border bg-card/95 backdrop-blur-xs transition-[width] duration-200 ease-in-out",
          state === "collapsed"
            ? "w-[var(--sidebar-width-icon)]"
            : "w-[var(--sidebar-width)]"
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      variant="ghost"
      size="icon-sm"
      className={cn("size-8 text-muted-foreground hover:text-foreground", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="header"
      className={cn(
        "flex flex-col gap-2 p-2.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center",
        className
      )}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center scrollbar-none",
        className
      )}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="footer"
      className={cn(
        "flex flex-col gap-2 p-2 border-t border-border/60 bg-muted/20 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col py-1.5", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 outline-hidden group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group-content"
      className={cn("w-full text-sm space-y-0.5", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-sidebar="menu"
      className={cn(
        "flex w-full min-w-0 flex-col gap-0.5 list-none m-0 p-0 group-data-[collapsible=icon]:items-center",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-sidebar="menu-item"
      className={cn(
        "group/menu-item relative list-none group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full",
        className
      )}
      {...props}
    />
  )
}

interface SidebarMenuButtonProps extends React.ComponentProps<"button"> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string
}

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(({ asChild = false, isActive = false, tooltip: _tooltip, className, children, ...props }, ref) => {
  const buttonClasses = cn(
    "peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-1.5 text-left text-xs sm:text-[13px] font-medium transition-colors outline-hidden select-none",
    "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
    "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold",
    "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center",
    "[&>svg]:size-4 [&>svg]:shrink-0",
    className
  )

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref,
      "data-sidebar": "menu-button",
      "data-active": isActive,
      className: cn(buttonClasses, (children.props as any).className),
      ...props,
    })
  }

  return (
    <button
      ref={ref}
      data-sidebar="menu-button"
      data-active={isActive}
      className={buttonClasses}
      {...props}
    >
      {children}
    </button>
  )
})
SidebarMenuButton.displayName = "SidebarMenuButton"

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-sidebar="menu-badge"
      className={cn(
        "ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground group-hover/menu-item:text-foreground group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
  useSidebar,
}
