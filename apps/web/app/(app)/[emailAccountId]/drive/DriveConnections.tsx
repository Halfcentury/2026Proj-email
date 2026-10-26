"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { DriveConnectionCard } from "./DriveConnectionCard";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function DriveConnections() {
  const { data, isLoading, error } = useDriveConnections();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      {connections.length > 0 ? (
        <div>
          {connections.map((connection) => (
            <DriveConnectionCard key={connection.id} connection={connection} />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无云存储连接</EmptyTitle>
            <EmptyDescription>连接云存储后可开始整理文档。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </LoadingContent>
  );
}
