// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
export const promiseTimeout = (prom: Promise<any>, time: number) =>
  Promise.race([
    prom,
    new Promise((_r, reject) => setTimeout(() => reject('Provider stalled'), time))
  ])

export const shuffleArray = (array: any[]) =>
  array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)

export const quantile = (arr, q) => {
  const sorted = arr.sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  } else {
    return sorted[base]
  }
}

// used for the retry logic, exponentially backoff
// 1st retry: wait 50ms, 2nd retry: wait 800ms, 3rd retry: wait 3200ms, etc..
export const expRetryTimeout = (attempt: number) => {
  const base = 50
  const factor = 4
  return new Promise(resolve => setTimeout(resolve, base * factor ** attempt))
}

export const RATE_LIMIT_KEYWORDS = ['rate limit', 'capacity', 'capacity', 'exceeded', 'too many']
