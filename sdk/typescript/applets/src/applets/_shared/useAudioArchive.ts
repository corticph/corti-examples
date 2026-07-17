import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioArchiveDraft,
  type AudioArchiveEndpoint,
  type AudioArchiveEndReason,
  type AudioArchiveListItem,
  type AudioArchiveStartReason,
  buildAudioArchiveFileName,
  closeOpenAudioArchiveSegment,
  createAudioArchiveId,
  createAudioArchiveSegmentId,
  type StoredAudioArchive,
} from "./audio-archive";
import {
  clearStoredAudioArchives,
  deleteStoredAudioArchive,
  listStoredAudioArchives,
  putStoredAudioArchive,
} from "./audio-archive-store";

function archiveDurationMs(segments: AudioArchiveDraft["segments"]) {
  return segments.reduce((sum, segment) => sum + (segment.durationMs ?? 0), 0);
}

export function useAudioArchive(namespace: string) {
  const [archives, setArchives] = useState<AudioArchiveListItem[]>([]);
  const [activeArchive, setActiveArchive] = useState<AudioArchiveDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeArchiveRef = useRef<AudioArchiveDraft | null>(null);
  const chunkBlobsRef = useRef<Blob[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  const syncArchiveItems = useCallback((nextArchives: StoredAudioArchive[]) => {
    setArchives((previous) => {
      const previousUrls = new Map(previous.map((archive) => [archive.id, archive.playbackUrl]));
      const nextUrlMap = new Map<string, string>();

      const items = nextArchives.map((archive) => {
        const existingUrl = previousUrls.get(archive.id);
        const playbackUrl = existingUrl ?? URL.createObjectURL(archive.blob);
        nextUrlMap.set(archive.id, playbackUrl);
        return { ...archive, playbackUrl };
      });

      previous.forEach((archive) => {
        if (!nextUrlMap.has(archive.id)) {
          URL.revokeObjectURL(archive.playbackUrl);
        }
      });

      objectUrlsRef.current = nextUrlMap;
      return items;
    });
  }, []);

  const refreshArchives = useCallback(async () => {
    try {
      const stored = await listStoredAudioArchives(namespace);
      syncArchiveItems(stored);
      setError(null);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Failed to load saved audio archives.",
      );
    }
  }, [namespace, syncArchiveItems]);

  useEffect(() => {
    void refreshArchives();
    return () => {
      // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach cleanup callbacks are intentionally void
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, [refreshArchives]);

  const updateActiveArchive = useCallback((nextArchive: AudioArchiveDraft | null) => {
    activeArchiveRef.current = nextArchive;
    setActiveArchive(nextArchive);
  }, []);

  const startArchive = useCallback(
    async (params: {
      connectionKey: string;
      endpoint: AudioArchiveEndpoint;
      interactionId?: string;
      deviceLabel?: string;
      configuredCaptureMime: string;
      actualCaptureMime: string | null;
    }) => {
      const current = activeArchiveRef.current;
      if (current?.connectionKey === params.connectionKey) {
        return current;
      }

      const createdAt = Date.now();
      const draft: AudioArchiveDraft = {
        id: createAudioArchiveId(),
        connectionKey: params.connectionKey,
        endpoint: params.endpoint,
        interactionId: params.interactionId,
        createdAt,
        updatedAt: createdAt,
        deviceLabel: params.deviceLabel,
        configuredCaptureMime: params.configuredCaptureMime,
        actualCaptureMime: params.actualCaptureMime,
        segments: [],
        chunkCount: 0,
        totalBytes: 0,
      };

      chunkBlobsRef.current = [];
      updateActiveArchive(draft);
      setError(null);
      return draft;
    },
    [updateActiveArchive],
  );

  const updateActiveArchiveMetadata = useCallback(
    async (updates: Partial<AudioArchiveDraft>) => {
      const current = activeArchiveRef.current;
      if (!current) {
        return null;
      }
      const nextArchive = {
        ...current,
        ...updates,
        updatedAt: Date.now(),
      };
      updateActiveArchive(nextArchive);
      setError(null);
      return nextArchive;
    },
    [updateActiveArchive],
  );

  const appendChunk = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        return;
      }
      const current = activeArchiveRef.current;
      if (!current) {
        return;
      }
      chunkBlobsRef.current = [...chunkBlobsRef.current, blob];
      updateActiveArchive({
        ...current,
        chunkCount: current.chunkCount + 1,
        totalBytes: current.totalBytes + blob.size,
        updatedAt: Date.now(),
      });
      setError(null);
    },
    [updateActiveArchive],
  );

  const startSegment = useCallback(
    async (startReason: AudioArchiveStartReason) => {
      const current = activeArchiveRef.current;
      if (!current) {
        return;
      }
      const lastSegment = current.segments[current.segments.length - 1];
      if (lastSegment && lastSegment.endedAt == null) {
        return;
      }
      updateActiveArchive({
        ...current,
        updatedAt: Date.now(),
        segments: [
          ...current.segments,
          {
            id: createAudioArchiveSegmentId(),
            startedAt: Date.now(),
            endedAt: null,
            durationMs: null,
            startReason,
          },
        ],
      });
      setError(null);
    },
    [updateActiveArchive],
  );

  const endSegment = useCallback(
    async (endReason: AudioArchiveEndReason) => {
      const current = activeArchiveRef.current;
      if (!current) {
        return;
      }
      const nextSegments = closeOpenAudioArchiveSegment(current.segments, endReason);
      if (nextSegments === current.segments) {
        return;
      }
      updateActiveArchive({
        ...current,
        segments: nextSegments,
        updatedAt: Date.now(),
      });
      setError(null);
    },
    [updateActiveArchive],
  );

  const finalizeActiveArchive = useCallback(
    async (endReason: AudioArchiveEndReason) => {
      const current = activeArchiveRef.current;
      if (!current) {
        return null;
      }

      const segments = closeOpenAudioArchiveSegment(current.segments, endReason);
      const mimeType =
        current.actualCaptureMime || current.configuredCaptureMime || "application/octet-stream";
      const blob = new Blob(chunkBlobsRef.current, {
        type: mimeType || undefined,
      });

      updateActiveArchive(null);
      chunkBlobsRef.current = [];

      if (blob.size === 0) {
        setError(null);
        return null;
      }

      const archive: StoredAudioArchive = {
        id: current.id,
        connectionKey: current.connectionKey,
        endpoint: current.endpoint,
        interactionId: current.interactionId,
        createdAt: current.createdAt,
        finalizedAt: Date.now(),
        deviceLabel: current.deviceLabel,
        configuredCaptureMime: current.configuredCaptureMime,
        actualCaptureMime: current.actualCaptureMime,
        segments,
        segmentCount: segments.length,
        chunkCount: current.chunkCount,
        durationMs: archiveDurationMs(segments),
        sizeBytes: blob.size,
        mimeType,
        fileName: buildAudioArchiveFileName({
          endpoint: current.endpoint,
          createdAt: current.createdAt,
          mimeType,
        }),
        blob,
      };

      try {
        await putStoredAudioArchive(namespace, archive);
        await refreshArchives();
        setError(null);
        return archive;
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : "Failed to save the audio archive.",
        );
        return null;
      }
    },
    [namespace, refreshArchives, updateActiveArchive],
  );

  const discardActiveArchive = useCallback(async () => {
    chunkBlobsRef.current = [];
    updateActiveArchive(null);
    setError(null);
  }, [updateActiveArchive]);

  const removeArchive = useCallback(
    async (archiveId: string) => {
      try {
        await deleteStoredAudioArchive(namespace, archiveId);
        await refreshArchives();
        setError(null);
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : "Failed to delete the audio archive.",
        );
      }
    },
    [namespace, refreshArchives],
  );

  const clearArchives = useCallback(async () => {
    try {
      await clearStoredAudioArchives(namespace);
      syncArchiveItems([]);
      setError(null);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Failed to clear the audio archives.",
      );
    }
  }, [namespace, syncArchiveItems]);

  return {
    archives,
    activeArchive,
    error,
    refreshArchives,
    startArchive,
    updateActiveArchiveMetadata,
    appendChunk,
    startSegment,
    endSegment,
    finalizeActiveArchive,
    discardActiveArchive,
    removeArchive,
    clearArchives,
  };
}
