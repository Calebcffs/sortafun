// casino/games/crash-math.js - the pure maths for the rocket (no DOM).
// Bust point M = 0.99 / (1 - u). Under 1 means it blows up on the pad (1% of rounds).
// P(M > x) = 0.99 / x, so cashing out at any x (by hand or auto) returns 99%, whatever you do.
export const EDGE = 0.01, CAP = 10000, K = 0.11; // multiplier(t) = e^(K t), t in seconds
export function bust(u) { const m = (1 - EDGE) / (1 - u); return m < 1 ? 1 : Math.min(CAP, m); }
export const multAt = (sec) => Math.exp(K * Math.max(0, sec));
export const timeTo = (m) => Math.log(Math.max(1, m)) / K;
export const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
// does a cash out at multiplier x (hit before the bust) win? an auto target equal to the bust counts
export const survives = (M, x) => M >= x && M > 1;
