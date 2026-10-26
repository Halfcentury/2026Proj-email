"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  getAppPageFromNavItem,
  getAppPageFromPathname,
} from "@/utils/analytics/product";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | ((props: ComponentProps<"svg">) => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
};

export function SideNavMenu({
  items,
  activeHref,
}: {
  items: NavItem[];
  activeHref: string;
}) {
  const { closeMobileSidebar } = useSidebar();
  const pathname = usePathname();

  const currentAppPage = getAppPageFromPathname(pathname);

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.name} className="font-semibold">
          <SidebarMenuButton
            asChild
            isActive={item.active || activeHref === item.href}
            className="h-9"
            tooltip={item.name}
            sidebarName="left-sidebar"
          >
            <Link
              href={item.href}
              onClick={() => {
                const destinationAppPage = getAppPageFromNavItem({
                  name: item.name,
                  href: item.href,
                });

                closeMobileSidebar("left-sidebar");
              }}
            >
              <item.icon />
              <span>{item.name}</span>
              {item.new && (
                <Badge variant="green" className="ml-auto text-[10px]">
                  新增！
                </Badge>
              )}
              {item.beta && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  测试版
                </Badge>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
