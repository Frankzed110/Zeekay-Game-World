import { useLayoutEffect, useRef } from "react";

/** Ref that always holds the latest value (updated after render, safe for callbacks/loops). */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
