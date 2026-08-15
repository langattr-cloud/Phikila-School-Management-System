import { useCallback, useEffect, useRef, useState } from 'react'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Runs a request once per key change and exposes retry. A ref guard stops the
 * duplicate request React 19 StrictMode double-effects would otherwise send.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  toErrorMessage: (error: unknown) => string,
  deps: ReadonlyArray<unknown> = [],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  const messageRef = useRef(toErrorMessage)
  loaderRef.current = loader
  messageRef.current = toErrorMessage

  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: null }))

    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, loading: false, error: messageRef.current(error) })
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { ...state, reload }
}
