"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_KEYWORDS = exports.expRetryTimeout = exports.quantile = exports.shuffleArray = exports.promiseTimeout = void 0;
// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
const promiseTimeout = (prom, time) => Promise.race([
    prom,
    new Promise((_r, reject) => setTimeout(() => reject('Provider stalled'), time))
]);
exports.promiseTimeout = promiseTimeout;
const shuffleArray = (array) => array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
exports.shuffleArray = shuffleArray;
const quantile = (arr, q) => {
    const sorted = arr.sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    else {
        return sorted[base];
    }
};
exports.quantile = quantile;
// used for the retry logic, exponentially backoff
// 1st retry: wait 50ms, 2nd retry: wait 800ms, 3rd retry: wait 3200ms, etc..
const expRetryTimeout = (attempt) => {
    const base = 50;
    const factor = 4;
    return new Promise(resolve => setTimeout(resolve, base * factor ** attempt));
};
exports.expRetryTimeout = expRetryTimeout;
exports.RATE_LIMIT_KEYWORDS = ['rate limit', 'capacity', 'capacity', 'exceeded', 'too many'];
//# sourceMappingURL=utils.js.map