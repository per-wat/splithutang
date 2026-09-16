"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const OVERLAY_STATE_KEY = "__splitHutangOverlay";

export function useHistoryOverlay(marker: string) {
  const [open, setOpen] = useState(false);
  const ownsHistoryEntry = useRef(false);

  const openOverlay = useCallback(() => {
    if (open) return;

    const currentState = window.history.state;
    const nextState =
      currentState && typeof currentState === "object"
        ? { ...currentState, [OVERLAY_STATE_KEY]: marker }
        : { [OVERLAY_STATE_KEY]: marker };

    window.history.pushState(nextState, "", window.location.href);
    ownsHistoryEntry.current = true;
    setOpen(true);
  }, [marker, open]);

  const dismiss = useCallback(() => {
    if (!open) return;

    const currentEntryBelongsToOverlay =
      ownsHistoryEntry.current &&
      window.history.state?.[OVERLAY_STATE_KEY] === marker;

    ownsHistoryEntry.current = false;
    setOpen(false);

    if (currentEntryBelongsToOverlay) {
      window.history.back();
    }
  }, [marker, open]);

  const closeForNavigation = useCallback(() => {
    ownsHistoryEntry.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePopState() {
      ownsHistoryEntry.current = false;
      setOpen(false);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [open]);

  return {
    open,
    openOverlay,
    dismiss,
    closeForNavigation,
  };
}
