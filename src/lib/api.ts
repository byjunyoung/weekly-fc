// src/lib/api.ts (Task 2에서 통째로 교체)
import type { Data } from './types';
export const EMPTY: Data = { players: [], matches: [], rotation: [], fines: [], lineups: [] };
export function onData(render: (d: Data) => void): void { render(EMPTY); }
export function isAdmin(): boolean { return false; }
export async function login(_pin: string): Promise<boolean> { return false; }
export function logout(): void {}
