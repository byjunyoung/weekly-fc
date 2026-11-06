// src/react/game/net/session.ts — 온라인 세션의 입구. 방장(host.ts)·손님(guest.ts)·공통 약속(common.ts)을 한 곳에서 내보낸다.
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2
export * from './common.ts';
export type { HostSession, HostOptions } from './host.ts';
export type { GuestSession, GuestOptions } from './guest.ts';
export { createHostSession } from './host.ts';
export { createGuestSession } from './guest.ts';
