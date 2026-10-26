"use client";

// from: https://github.com/shadcn-ui/ui/issues/414#issuecomment-1772421366

import * as React from "react";
import Link, { type LinkProps } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/utils";

interface Context {
  defaultValue: string;
  hrefFor: (value: string) => LinkProps["href"];
  id: string;
  onValueChange?: (value: string) => void;
  searchParam: string;
  selected: string;
}
// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
const TabsContext = React.createContext<Context>(null as any);

export function Tabs(props: {
  children: React.ReactNode;
  className?: string;
  /**
   * The default tab
   */
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * Which search param to use
   * @default "tab"
   */
  searchParam?: string;
}) {
  const { children, className, searchParam = "tab", ...other } = props;
  const id = React.useId();
  const searchParams = useSearchParams();

  const selected =
    props.value ?? searchParams.get(searchParam) ?? props.defaultValue ?? "";

  const pathname = usePathname();
  const hrefFor: Context["hrefFor"] = React.useCallback(
    (value) => {
      const params = new URLSearchParams(searchParams);
      if (value === props.defaultValue) {
        params.delete(searchParam);
      } else {
        params.set(searchParam, value);
      }

      const asString = params.toString();

      return pathname + (asString ? `?${asString}` : "");
    },
    [searchParams, props.defaultValue, pathname, searchParam],
  );

  return (
    <TabsContext.Provider
      value={{
        ...other,
        id,
        defaultValue: props.defaultValue ?? "",
        hrefFor,
        searchParam,
        selected,
      }}
    >
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

const useContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(
      "Tabs compound components cannot be rendered outside the Tabs component",
    );
  }

  return context;
};

export function TabsList(props: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(TabsContext);
  const controlled = Boolean(context?.onValueChange);
  return (
    <div
      {...props}
      role={controlled ? "tablist" : undefined}
      onKeyDown={
        controlled
          ? (event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const index = tabs.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              event.preventDefault();
              event.stopPropagation();
              tabs[next]?.focus();
              tabs[next]?.click();
            }
          : undefined
      }
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        props.className,
      )}
    />
  );
}

export const TabsTrigger = (props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) => {
  const context = useContext();

  if (context.onValueChange) {
    return (
      <button
        type="button"
        role="tab"
        id={`tab-${context.id}-${props.value}`}
        aria-controls={`panel-${context.id}-${props.value}`}
        tabIndex={context.selected === props.value ? 0 : -1}
        aria-selected={context.selected === props.value}
        data-state={context.selected === props.value ? "active" : "inactive"}
        onClick={() => context.onValueChange?.(props.value)}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
          props.className,
        )}
      >
        {props.children}
      </button>
    );
  }

  return (
    <Link
      {...props}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        props.className,
      )}
      data-state={context.selected === props.value ? "active" : "inactive"}
      href={context.hrefFor(props.value)}
      scroll={false}
      shallow={true}
    />
  );
};

export function TabsContent(props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) {
  const context = useContext();

  if (context.selected !== props.value) {
    return null;
  }

  return (
    <div
      {...props}
      {...(context.onValueChange
        ? {
            role: "tabpanel",
            id: `panel-${context.id}-${props.value}`,
            "aria-labelledby": `tab-${context.id}-${props.value}`,
          }
        : {})}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.className,
      )}
    />
  );
}
