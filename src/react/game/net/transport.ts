// src/react/game/net/transport.ts — 메시지가 지나가는 길(Transport)의 약속과, 테스트용 메모리 길(루프백).
// 설계: docs/superpowers/specs/2026-11-06-game-online-design.md §2.1
//
// 세션(session.ts)은 이 약속만 안다 — 지금은 Supabase 실시간 채널(realtime.ts)이 구현하지만, 나중에 직접 연결로
// 바꿀 때 세션을 안 고치려고 길을 인터페이스 뒤에 둔다(스펙 §1). 브라우저 API 를 안 쓰는 파일이라 node 테스트가 그대로 가져온다.
import type { NetMsg } from '../../../lib/games/net.ts';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export type Transport = {
  /** 방 전체에 보낸다(나 빼고). 연결이 안 열렸으면 버린다 — 상태는 어차피 다시 보낸다. */
  send(msg: NetMsg): void;
  /** 받은 것. 모양은 믿지 말 것 — 받는 쪽이 parseMsg 로 거른다(그래서 unknown 으로 넘긴다). */
  onMessage(cb: (msg: unknown) => void): void;
  /** 연결 상태. 등록하는 순간 지금 상태로 한 번 불린다. */
  onStatus(cb: (s: ConnStatus) => void): void;
  close(): void;
  /** 지금 살아 있나 떠보기(2026-11-07 리뷰 #3, 선택) — 박동을 바로 하나 보내고, PROBE_MS 안에 답이 없으면 끊고 다시 붙는다(상태가 connecting 으로).
   *  폰이 망을 바꾸면 소켓이 닫힘 알림 없이 죽는다 — 세션이 상대 침묵을 느낄 때 부른다. 없는 길(루프백)은 아무것도 안 한다. */
  probe?(): void;
  /** 경기 중인가(선택) — 경기 중엔 박동을 자주(10초), 로비에선 드물게(25초). */
  setLive?(live: boolean): void;
};

// ═══════════════════════════ 루프백(테스트·개발용) ═══════════════════════════
// 같은 허브에 붙은 다른 끝점 모두에게 배달한다(보낸 쪽 빼고 — 실시간 채널의 self:false 와 같게).
// 시계를 모른다: 배달은 pump(now) 가 부를 때만 일어난다 — 테스트가 시간을 한 칸씩 밀며 결정적으로 돌리게.
// 선로 위에선 JSON 으로 한 번 오갔다 오게 해 진짜 길과 같이 참조를 나누지 않는다.

export type LoopbackEndpoint = Transport & {
  /** 이 끝점이 지금까지 보낸 메시지 수(연결이 끊겨 버린 것은 빼고). 방송 한도 테스트용. */
  readonly sent: number;
  /** 보낸 메시지 종류별 수. */
  readonly sentByType: Record<string, number>;
  /** true 면 이 끝점이 보내는 것이 사라진다(탭이 얼었거나 망이 끊긴 흉내). 받는 건 그대로. */
  mute(on: boolean): void;
  /** 연결 상태를 바꿔 본다(재접속 흉내). */
  setStatus(s: ConnStatus): void;
};

export type LoopbackHub = {
  endpoint(): LoopbackEndpoint;
  /** now 까지 도착할 메시지를 보낸 순서대로 배달한다. */
  pump(now: number): void;
  /** 아직 배달 안 된 메시지 수. */
  readonly pending: number;
};

type Wire = { at: number; from: number; data: string };

export function createLoopbackHub(opts: { delayMs?: number; now: () => number }): LoopbackHub {
  const delay = Math.max(0, opts.delayMs ?? 0);
  const queue: Wire[] = [];
  const eps: { id: number; msg: ((m: unknown) => void)[]; closed: boolean; status: ConnStatus }[] = [];
  let nextId = 0;

  const hub: LoopbackHub = {
    endpoint() {
      const me = { id: nextId++, msg: [] as ((m: unknown) => void)[], closed: false, status: 'open' as ConnStatus };
      eps.push(me);
      const statusCbs: ((s: ConnStatus) => void)[] = [];
      let muted = false, sent = 0;
      const sentByType: Record<string, number> = {};
      return {
        send(m) {
          if (me.closed || muted || me.status !== 'open') return;
          sent++; sentByType[m.t] = (sentByType[m.t] ?? 0) + 1;
          queue.push({ at: opts.now() + delay, from: me.id, data: JSON.stringify(m) });
        },
        onMessage(cb) { me.msg.push(cb); },
        onStatus(cb) { statusCbs.push(cb); cb(me.status); },
        close() { me.closed = true; me.status = 'closed'; },
        get sent() { return sent; },
        get sentByType() { return sentByType; },
        mute(on) { muted = on; },
        setStatus(s) { me.status = s; for (const cb of statusCbs) cb(s); },
      };
    },
    pump(now) {
      // 배달 중에 새로 보낸 것(답장)은 지연이 0 이어도 다음 pump 에서 — 한 번에 끝없이 핑퐁하지 않게.
      const due: Wire[] = [];
      for (let i = 0; i < queue.length;) {
        if (queue[i].at <= now) { due.push(queue[i]); queue.splice(i, 1); } else i++;
      }
      for (const w of due) {
        for (const ep of eps) {
          if (ep.id === w.from || ep.closed || ep.status !== 'open') continue;
          for (const cb of ep.msg) cb(JSON.parse(w.data));
        }
      }
    },
    get pending() { return queue.length; },
  };
  return hub;
}
