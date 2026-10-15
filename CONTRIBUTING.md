# Contributing

Issues and pull requests are welcome.

1. Fork the repo and branch from `main`.
2. `npm install`, then `npm run dev` to try your change in the editor.
3. Before opening a PR, run `npm run lint` and `npm run build`; CI runs both.
4. Keep `DotSwarmText` dependency-free: the component ships as a single file
   that needs only React. Anything it imports from `src/text-swarm/` must be
   listed in `MODULES` in `scripts/registry.ts`.
5. Describe what changed and why, with a screen recording if it changes motion.

By contributing you agree that your work is released under the [MIT License](LICENSE).
