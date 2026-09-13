import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ChevronDown, ExternalLink, LayoutGrid, LogOut, Moon, Search, Sun, SunMoon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { useSession } from '@/auth/session';
import { useTheme } from '@/hooks/use-theme';
import { APP_VERSION, EXTERNAL_APPS } from '@/lib/env';
import { NAV } from './nav';
import { CommandPalette } from './command-palette';

// Apex-style application shell: grouped collapsible sidebar, persistent
// search, compact header. The sidebar becomes an off-canvas sheet below 768px
// (shadcn Sidebar handles that).

export function AppShell() {
  const s = useSession();
  const { theme, setTheme } = useTheme();
  const loc = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const visible = NAV.filter((n) => s.caps.can(n.action));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="px-3 py-3">
          <Link to="/today" className="flex items-center gap-2 font-semibold text-sidebar-foreground">
            <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold" aria-hidden>C</span>
            <span className="truncate group-data-[collapsible=icon]:hidden">Cascade Admin</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visible.map((item) => {
                  const active = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/');
                  const kids = (item.children ?? []).filter((c) => !c.action || s.caps.can(c.action));
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to} end={!kids.length}>
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                          {kids.length > 0 && <ChevronDown className="ml-auto size-3.5 opacity-60" aria-hidden />}
                        </NavLink>
                      </SidebarMenuButton>
                      {active && kids.length > 0 && (
                        <SidebarMenuSub>
                          {kids.map((c) => (
                            <SidebarMenuSubItem key={c.to}>
                              <SidebarMenuSubButton asChild isActive={loc.pathname === c.to}>
                                <NavLink to={c.to} end>
                                  <span>{c.label}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Apps</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {EXTERNAL_APPS.map((a) => (
                  <SidebarMenuItem key={a.key}>
                    <SidebarMenuButton asChild tooltip={a.label} size="sm">
                      <a href={a.href} target="_blank" rel="noopener noreferrer">
                        <ExternalLink aria-hidden />
                        <span>{a.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          v{APP_VERSION} · Asia/Manila · PHP
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="size-9" aria-label="Toggle navigation" />
          <Button variant="outline" className="h-9 w-full max-w-md justify-start gap-2 text-muted-foreground sm:w-72" onClick={() => setPaletteOpen(true)}>
            <Search className="size-4" aria-hidden />
            <span className="truncate">Search or jump to…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Apps">
                  <LayoutGrid className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Apps</DropdownMenuLabel>
                {EXTERNAL_APPS.map((a) => (
                  <DropdownMenuItem key={a.key} asChild>
                    <a href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Theme">
                  {theme === 'dark' ? <Moon className="size-4" aria-hidden /> : theme === 'system' ? <SunMoon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
                  <span className="flex size-6 items-center justify-center rounded-full bg-cream text-xs font-semibold text-mahogany" aria-hidden>
                    {s.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-32 truncate text-sm sm:inline">{s.displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="space-y-1">
                  <div className="truncate">{s.displayName}</div>
                  <div className="flex gap-1">
                    <Badge variant="secondary" className="capitalize">{s.caps.role ?? 'no role'}</Badge>
                    <Badge variant={s.caps.aal === 'aal2' ? 'secondary' : 'outline'}>{s.caps.aal === 'aal2' ? '2FA verified' : 'No 2FA'}</Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void s.signOut()}>
                  <LogOut aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-3 py-4 sm:px-6" id="main">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
