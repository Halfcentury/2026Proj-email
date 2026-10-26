"use client";

import type React from "react";
import { useEffect } from "react";
import { setDefaultOptions } from "date-fns/setDefaultOptions";
import { zhCN } from "date-fns/locale/zh-CN";
import { usePathname } from "next/navigation";
import {
  SAVE_OFFLINE_MAIL,
  SKIP_WAITING,
  isOfflineMailPath,
} from "@/utils/offline/mail-cache";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { toast } from "sonner";
import { SWRConfig } from "swr";
import { swrFetcher } from "./swr-fetcher";
setDefaultOptions({ locale: zhCN });

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    // Registers the service worker built by `serwist build`; the @serwist/next
    // webpack plugin used to inject this registration, but it doesn't support
    // Turbopack. cacheOnNavigation={false} matches the old plugin default.
    <SerwistProvider
      swUrl="/sw.js"
      register={false}
      cacheOnNavigation={false}
      disable={process.env.NODE_ENV !== "production"}
    >
      <ManageServiceWorker />
      {null}
      <SWRConfig value={{ fetcher: swrFetcher }}>
        <NuqsAdapter>{props.children}</NuqsAdapter>
      </SWRConfig>
    </SerwistProvider>
  );
}

// SerwistProvider's own register drops the promise, so the failures that come
// with crawlers, webviews and private browsing surface as unhandled rejections.
// Registration failures must not interrupt the online app.
function ManageServiceWorker() {
  const { serwist } = useSerwist();
  const pathname = usePathname();

  useEffect(() => {
    if (!serwist) return;
    let cancelled = false;
    const save = () => saveOfflineMailPage(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", save);
    serwist
      .register()
      .then((registration) => {
        if (cancelled || !registration) return;
        save();
        if (registration.waiting && navigator.serviceWorker.controller) {
          toast.info("有可用更新", {
            id: "web-update",
            action: {
              label: "重新加载",
              onClick() {
                registration.waiting?.postMessage({ type: SKIP_WAITING });
                window.location.reload();
              },
            },
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", save);
    };
  }, [serwist]);

  useEffect(() => {
    if (!serwist || !pathname || !isOfflineMailPath(pathname)) return;
    saveOfflineMailPage(navigator.serviceWorker.controller);
  }, [serwist, pathname]);

  return null;
}

function saveOfflineMailPage(worker: ServiceWorker | null | undefined) {
  if (
    !isOfflineMailPath(window.location.pathname) ||
    !navigator.onLine ||
    document.visibilityState !== "visible"
  )
    return;
  worker?.postMessage({ type: SAVE_OFFLINE_MAIL });
}
