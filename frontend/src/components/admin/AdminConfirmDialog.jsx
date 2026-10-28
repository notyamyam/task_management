import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

import { useAdminFocusTrap } from "./useAdminFocusTrap";

const AdminConfirmDialog = ({
  isOpen,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isBusy = false,
  onConfirm,
  onClose,
  returnFocusRef,
}) => {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
  }, [isOpen, returnFocusRef]);

  const close = () => {
    if (isBusy) return;
    onClose();
    returnFocusRef?.current?.focus();
  };

  useAdminFocusTrap({
    isOpen,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: close,
    isBusy,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby="admin-confirm-title"
        aria-modal="true"
        className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 id="admin-confirm-title" className="text-lg font-semibold text-slate-950">{title}</h2>
              <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
            </div>
          </div>
          <button type="button" aria-label="Close confirmation" onClick={close} disabled={isBusy} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={close} disabled={isBusy} className="min-h-11 cursor-pointer border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={isBusy} className="min-h-11 cursor-pointer bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isBusy ? "Working..." : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
};

export default AdminConfirmDialog;
