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

    const currentState = window.history.state;

    if (currentState?.[OVERLAY_STATE_KEY] === marker) {
      const nextState = { ...currentState };
      delete nextState[OVERLAY_STATE_KEY];
      window.history.replaceState(nextState, "", window.location.href);
    }
  }, [marker]);

  useEffect(() => {
    if (!open) return;

    function handlePopState(event: PopStateEvent) {
      if (event.state?.[OVERLAY_STATE_KEY] === marker) {
        ownsHistoryEntry.current = true;
        return;
      }

      ownsHistoryEntry.current = false;
      setOpen(false);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [marker, open]);

  return {
    open,
    openOverlay,
    dismiss,
    closeForNavigation,
  };
}
