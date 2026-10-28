import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

export const useAdminFocusTrap = ({ isOpen, containerRef, initialFocusRef, onEscape, isBusy = false }) => {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const frame = requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
      if (!containerRef.current?.contains(document.activeElement)) {
        containerRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus();
      }
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (!isBusy) {
          event.preventDefault();
          onEscapeRef.current();
        }
        return;
      }

      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = [...containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !containerRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !containerRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, initialFocusRef, isBusy, isOpen]);
};
