// Phase 11 lane C: position bias of `[...items].sort(() => Math.random() - 0.5)`, the shuffle used by
// TheoryQuizScreen.tsx and IntervalTrainerScreen.tsx (both put the correct answer at index 0 first).
// Row i = where input element i lands (percent per output position). Run under each engine:
//   node scripts/audit/shuffle-bias-probe.cjs
//   ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron scripts/audit/shuffle-bias-probe.cjs
const run = (n, iters) => {
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < iters; i += 1) [...Array(n).keys()].sort(() => Math.random() - 0.5).forEach((v, p) => { m[v][p] += 1; });
  return m.map((row) => row.map((c) => Number((100 * c / iters).toFixed(1))));
};
console.log(JSON.stringify({ electron: process.versions.electron, v8: process.versions.v8, node: process.versions.node, four: run(4, 200000), six: run(6, 200000) }));
