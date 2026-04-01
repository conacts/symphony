"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type {
  SymphonyRealtimeChannel,
  SymphonyRealtimeServerMessage
} from "@symphony/contracts";
import {
  parseRealtimeServerMessage,
  serializeRealtimeClientMessage
} from "@/core/runtime-summary-client";

export type RealtimeResourceStatus = "connecting" | "connected" | "degraded";

export function shouldDegradeRealtimeState(input: {
  hasResource: boolean;
  hasConnectedOnce: boolean;
}): boolean {
  return input.hasResource || input.hasConnectedOnce;
}

export function shouldRefreshAfterConnectionAck(input: {
  subscribedChannels: SymphonyRealtimeChannel[];
  requestedChannels: SymphonyRealtimeChannel[];
  hasResource: boolean;
  error: string | null;
}): boolean {
  if (!hasSubscribedToRequestedChannels(input)) {
    return false;
  }

  return !input.hasResource || input.error !== null;
}

export function useRealtimeResource<T>(input: {
  loadResource: () => Promise<T>;
  websocketUrl: string;
  channels: SymphonyRealtimeChannel[];
  shouldRefresh: (message: SymphonyRealtimeServerMessage) => boolean;
  refreshKey: string;
}) {
  const [resource, setResource] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<RealtimeResourceStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const channelsKey = input.channels.join("|");
  const shouldRefresh = useEffectEvent(input.shouldRefresh);

  const refresh = useEffectEvent(async () => {
    try {
      const nextResource = await input.loadResource();

      startTransition(() => {
        setResource(nextResource);
        setLoading(false);
        setError(null);
      });
    } catch (resourceError) {
      const nextError =
        resourceError instanceof Error
          ? resourceError.message
          : "Failed to load the requested resource.";

      startTransition(() => {
        setLoading(false);
        setError(nextError);
        setStatus("degraded");
      });
    }
  });

  const handleConnectionAck = useEffectEvent(
    (message: Extract<SymphonyRealtimeServerMessage, { type: "connection.ack" }>) => {
      const shouldRefreshNow = shouldRefreshAfterConnectionAck({
        subscribedChannels: message.subscribedChannels,
        requestedChannels: input.channels,
        hasResource: resource !== null,
        error
      });

      if (
        !hasSubscribedToRequestedChannels({
          subscribedChannels: message.subscribedChannels,
          requestedChannels: input.channels
        })
      ) {
        return;
      }

      startTransition(() => {
        setHasConnectedOnce(true);
        setStatus("connected");
        setError(null);
      });

      if (shouldRefreshNow) {
        void refresh();
      }
    }
  );

  const handleConnectionFailure = useEffectEvent((message: string) => {
    if (
      shouldDegradeRealtimeState({
        hasResource: resource !== null,
        hasConnectedOnce
      })
    ) {
      startTransition(() => {
        setStatus("degraded");
        setError((currentError) => currentError ?? message);
      });
      return;
    }

    startTransition(() => {
      setStatus("connecting");
      setError(null);
    });
  });

  useEffect(() => {
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    void refresh();
  }, [input.refreshKey]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;

    const connect = () => {
      if (disposed) {
        return;
      }

      socket = new WebSocket(input.websocketUrl);

      socket.addEventListener("open", () => {
        socket?.send(
          serializeRealtimeClientMessage({
            type: "subscribe",
            channels: input.channels
          })
        );
      });

      socket.addEventListener("message", (event) => {
        const message = parseRealtimeServerMessage(String(event.data));

        if (!message) {
          startTransition(() => {
            setStatus("degraded");
            setError("Received an invalid realtime message.");
          });
          return;
        }

        if (message.type === "connection.ack") {
          handleConnectionAck(message);
          return;
        }

        if (shouldRefresh(message)) {
          void refresh();
        }
      });

      socket.addEventListener("close", () => {
        if (disposed) {
          return;
        }

        handleConnectionFailure("Realtime connection closed.");

        reconnectTimeout = window.setTimeout(connect, 1_500);
      });

      socket.addEventListener("error", () => {
        handleConnectionFailure("Realtime connection failed.");
      });
    };

    connect();

    return () => {
      disposed = true;

      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }

      socket?.close();
    };
  }, [channelsKey, input.websocketUrl]);

  return {
    resource,
    loading,
    status,
    error,
    refresh
  };
}

export function hasSubscribedToRequestedChannels(input: {
  subscribedChannels: SymphonyRealtimeChannel[];
  requestedChannels: SymphonyRealtimeChannel[];
}): boolean {
  const subscribedChannels = new Set(input.subscribedChannels);

  return input.requestedChannels.every((channel) => subscribedChannels.has(channel));
}
