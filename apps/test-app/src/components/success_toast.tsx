import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Radio, X } from "lucide-react";

const successToastTimeoutMs = 4_000;
const rememberedOperationLimit = 100;

interface SuccessToastInput {
  message: string;
  operationId: string;
}

interface SuccessToastValue {
  success: (input: SuccessToastInput) => void;
}

interface ActiveToast extends SuccessToastInput {
  sequence: number;
}

interface ToastPlacement {
  kind: "below" | "header";
  left: number;
  top: number;
}

const SuccessToastContext = createContext<SuccessToastValue | undefined>(undefined);

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast>();
  const sequence = useRef(0);
  const rememberedOperations = useRef(new Set<string>());

  const dismiss = useCallback(() => setToast(undefined), []);
  const success = useCallback((input: SuccessToastInput) => {
    const remembered = rememberedOperations.current;
    if (remembered.has(input.operationId)) return;
    if (remembered.size >= rememberedOperationLimit) {
      const oldest = remembered.values().next().value as string | undefined;
      if (oldest) remembered.delete(oldest);
    }
    remembered.add(input.operationId);
    sequence.current += 1;
    setToast({ ...input, sequence: sequence.current });
  }, []);

  return (
    <SuccessToastContext.Provider value={{ success }}>
      {children}
      <SuccessToastHost onDismiss={dismiss} toast={toast} />
    </SuccessToastContext.Provider>
  );
}

export function useSuccessToast(): SuccessToastValue {
  const value = useContext(SuccessToastContext);
  if (!value) throw new Error("useSuccessToast must be used within SuccessToastProvider.");
  return value;
}

function SuccessToastHost({
  onDismiss,
  toast,
}: {
  onDismiss: () => void;
  toast?: ActiveToast;
}) {
  const toastRef = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remaining = useRef(successToastTimeoutMs);
  const startedAt = useRef(0);
  const hasFocus = useRef(false);
  const isHovered = useRef(false);
  const [placement, setPlacement] = useState<ToastPlacement>({ kind: "below", left: 0, top: 0 });

  const clearTimer = useCallback(() => {
    if (timeout.current === undefined) return;
    clearTimeout(timeout.current);
    timeout.current = undefined;
  }, []);

  const pauseTimer = useCallback(() => {
    if (timeout.current === undefined) return;
    remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    clearTimer();
  }, [clearTimer]);

  const resumeTimer = useCallback(() => {
    if (!toast || timeout.current !== undefined) return;
    startedAt.current = performance.now();
    timeout.current = setTimeout(onDismiss, remaining.current);
  }, [onDismiss, toast]);

  useEffect(() => {
    clearTimer();
    if (!toast) return;
    remaining.current = successToastTimeoutMs;
    startedAt.current = performance.now();
    timeout.current = setTimeout(onDismiss, remaining.current);
    return clearTimer;
  }, [clearTimer, onDismiss, toast]);

  useLayoutEffect(() => {
    if (!toast) return;
    const anchor = document.querySelector<HTMLElement>("[data-success-toast-anchor]");
    const visualToast = toastRef.current;
    if (!anchor || !visualToast) return;

    const measure = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const toastRect = visualToast.getBoundingClientRect();
      const center = anchorRect.left + anchorRect.width / 2;
      const proposedLeft = center - toastRect.width / 2;
      const proposedRight = center + toastRect.width / 2;
      const horizontalPadding = 12;
      const fits = proposedLeft >= anchorRect.left + horizontalPadding
        && proposedRight <= anchorRect.right - horizontalPadding;
      const collides = [...anchor.querySelectorAll<HTMLElement>("[data-success-toast-avoid]")]
        .some((element) => {
          const occupied = element.getBoundingClientRect();
          return proposedLeft < occupied.right && proposedRight > occupied.left;
        });
      const kind = fits && !collides ? "header" : "below";
      const next = {
        kind,
        left: center,
        top: kind === "header"
          ? anchorRect.top + anchorRect.height / 2
          : anchorRect.bottom,
      } satisfies ToastPlacement;
      setPlacement((current) => (
        current.kind === next.kind && current.left === next.left && current.top === next.top
          ? current
          : next
      ));
    };

    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    observer.observe(visualToast);
    for (const element of anchor.querySelectorAll<HTMLElement>("[data-success-toast-avoid]")) {
      observer.observe(element);
    }
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [toast]);

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="success-toast-region"
      data-placement={placement.kind}
      role="status"
      style={{ left: placement.left, top: placement.top }}
    >
      {toast && (
        <div
          className="success-toast"
          onBlurCapture={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            hasFocus.current = false;
            if (!isHovered.current) resumeTimer();
          }}
          onFocusCapture={() => {
            hasFocus.current = true;
            pauseTimer();
          }}
          onMouseEnter={() => {
            isHovered.current = true;
            pauseTimer();
          }}
          onMouseLeave={() => {
            isHovered.current = false;
            if (!hasFocus.current) resumeTimer();
          }}
          ref={toastRef}
        >
          <span className="success-toast-signal" aria-hidden="true">
            <Radio size={16} strokeWidth={2.5} />
          </span>
          <span className="success-toast-copy">{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={onDismiss} type="button">
            <X size={17} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  );
}
