// 안내 > 시작하기 「포털」 칸 — 로그인·이름 고르기 상태에 따라 버튼 또는 연결 문구를 고른다.
import type { Me } from '../../lib/auth.ts';

export type StartView =
  | { kind: 'linked'; text: string; to: string }    // 이미 이름을 고름
  | { kind: 'cta'; button: string; hint: string };

export function startView(me: Me): StartView {
  if (!me.login) return { kind: 'cta', button: '로그인하고 내 이름 고르기', hint: '메일로 6자리 코드를 받아 로그인합니다' };
  if (me.num == null) return { kind: 'cta', button: '내 이름 고르기', hint: '명단에 이름이 없으면 단톡방에 알려 주세요' };
  return { kind: 'linked', text: `${me.name ?? `${me.num}번`} 님으로 연결됐습니다`, to: `/squad/${me.num}/` };
}
