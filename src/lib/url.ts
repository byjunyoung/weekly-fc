// base 경로('/weekly-fc')를 붙인 내부 링크. 페이지·스크립트 어디서나 이것만 쓴다.
const base = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/').replace(/\/$/, '');
export const href = (path: string): string => base + (path.startsWith('/') ? path : '/' + path);
