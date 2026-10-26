"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnnouncementCard } from "@/components/feature-announcements/AnnouncementDialog";
import { FollowUpRemindersIllustration } from "@/components/feature-announcements/FollowUpRemindersIllustration";
import type { Announcement } from "@/utils/announcements";

const DETAIL_ICON_CLASS = "h-4 w-4 text-gray-600 dark:text-gray-400";

export function AnnouncementDialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const announcement = getDemoAnnouncement();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>打开公告</Button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
            />

            <motion.div
              key="modal-container"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="pointer-events-auto relative">
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute -right-9 -top-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                  <ScrollArea className="max-h-[600px] [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                    <div className="flex flex-col gap-4 p-4">
                      <AnnouncementCard
                        announcement={announcement}
                        onClose={handleClose}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function getDemoAnnouncement(): Announcement {
  return {
    id: "follow-up-reminders",
    title: "跟进提醒",
    description: "跟踪回复，提醒处理尚未答复的邮件。",
    image: <FollowUpRemindersIllustration />,
    link: "/automation?tab=settings",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
    details: [
      {
        title: "自动跟进标签",
        description: "三天未收到回复时为会话添加标签。",
        icon: <Tag className={DETAIL_ICON_CLASS} />,
      },
      {
        title: "自动生成草稿",
        description: "为尚未回复的联系人起草跟进邮件。",
        icon: <FileEdit className={DETAIL_ICON_CLASS} />,
      },
    ],
  };
}
