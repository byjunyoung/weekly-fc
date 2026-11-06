# 축구 게임 2단계 — 온라인 방(2026-11-06)

> 사용자: "2단계 온라인으로 넘어가자". 방향은 `2026-11-06-game-design.md` 의 인터뷰 결과 그대로다
> (방장이 1대1~4대4, 빈자리 봇, 폰·PC, 로그인 없이 선수 고르기, 방장 기기가 계산, 「게임」 메뉴, 기본 + 방 안 한마디).

## 1. 연결 방식 — Supabase 실시간 채널로 중계 (내 결정, 1단계 스펙 §5 의 "WebRTC" 를 덧씌운다)

- 방장 기기가 경기를 계산한다는 사용자 결정은 그대로다. 바뀌는 건 **메시지가 지나가는 길**뿐이다.
- 기기끼리 직접 붙는 방식(WebRTC)은 통신사 망(폰 LTE·5G)끼리는 중계 서버 없이 자주 실패한다. 중계 서버는 새 서비스라 사용자가 뺀 선택지다.
- 포털이 이미 쓰는 Supabase 의 실시간 채널(Broadcast)은 가입·표·마이그레이션 없이 익명 키로 바로 된다.
  실측(2026-11-06, 서울 프로젝트): 두 접속 입장 ok, 한쪽 방향 지연 중앙 75ms, 1KB × 초당 10개 전부 도착, 1초에 150개도 빠짐 없음.
- 무료 한도(월 메시지 수·초당 이벤트)가 있으므로 **적게 보낸다**: 상태는 초당 10번, 입력은 바뀔 때만 + 초당 2번 살아 있음 알림.
- 나중에 직접 연결로 바꿀 수 있게 길을 인터페이스(`Transport`) 뒤에 둔다.

## 2. 구조

```
src/lib/game/sim.ts · stats.ts · bot.ts   1단계 그대로(순수). 방장도 손님도 같은 step() 을 돈다
src/lib/game/room.ts      방 상태(누가 어느 칸, 설정)와 그 변화 — 순수
src/lib/game/net.ts       메시지 모양, 입력 줄이기(양자화), 손님 쪽 예측 — 순수
src/react/game/net/realtime.ts   Supabase 실시간 채널(WebSocket) — Transport 구현
src/react/game/net/session.ts    방장 세션 / 손님 세션(틱 루프, 보내고 받기)
src/react/game/*          입장 화면, 방(로비) 화면, 경기 화면(1단계 것 재사용)
```

### 2.1 Transport

```ts
export type Transport = {
  send(msg: NetMsg): void;                     // 방 전체에 보낸다(나 빼고)
  onMessage(cb: (msg: NetMsg) => void): void;
  onStatus(cb: (s: 'connecting' | 'open' | 'closed') => void): void;
  close(): void;
};
```
- 채널 이름 `game:<방 코드>`. 방 코드는 헷갈리는 글자를 뺀 대문자·숫자 4자(방장이 만든다). 주소 `/game/?room=ABCD`.
- 실시간 채널의 Presence 기능은 쓰지 않는다. 누가 있는지는 우리 메시지(hello·room·bye)와 침묵 시간으로 판단한다 — 규칙을 우리가 다 쥐려고.
- 접속 프로토콜(Phoenix 채널): `wss://<프로젝트>/realtime/v1/websocket?apikey=<익명 키>&vsn=1.0.0`, 입장
  `{topic:'realtime:game:ABCD', event:'phx_join', payload:{config:{broadcast:{self:false, ack:false}}}, ref}`,
  보내기 `{topic, event:'broadcast', payload:{type:'broadcast', event:'m', payload:<NetMsg>}, ref}`,
  25초마다 `{topic:'phoenix', event:'heartbeat', payload:{}, ref}`. 끊기면 다시 붙고 다시 입장한다.

### 2.2 신원

- 기기마다 `clientId`(무작위 UUID, sessionStorage) — 새로고침해도 같은 자리로 돌아온다. 로그인은 필요 없다.
- 방장 = 방을 만든 clientId. 방장이 나가면 방은 끝난다(넘기기는 다음으로).

### 2.3 방 상태 (`room.ts`, 순수)

```ts
export type Team = 0 | 1 | null;                 // null = 대기 칸
export type Member = { clientId: string; num: number; name: string; team: Team };   // num = 고른 선수의 고유 번호
export type RoomSettings = { perSide: 1 | 2 | 3 | 4; minutes: number; scoreLimit: number };
export type RoomState = { code: string; hostId: string; members: Member[]; settings: RoomSettings; phase: 'lobby' | 'match'; rev: number };
```
- 방장만 방 상태를 바꾸고, 바뀔 때마다(그리고 1초마다) 전체를 보낸다. 손님은 받은 것을 그대로 쓴다(`rev` 가 낮은 것은 버림).
- 규칙: 한 방에서 한 선수(num)는 한 사람만. 팀 칸 정원은 `perSide`. 정원이 찼으면 대기 칸으로.
- 시작: 두 팀 칸의 사람은 그 선수로, 모자란 자리는 명단에서 무작위로 뽑은 봇(이미 들어온 선수 제외)으로 채워 `MatchConfig` 를 만든다.
  사람이 한 명도 없는 팀도 된다(전부 봇). 대기 칸 사람은 구경한다.
- [자동 나누기]: 사람들을 종합 능력치가 비슷하게 두 팀으로(넘치면 대기).

### 2.4 메시지 (`net.ts`)

```ts
type NetMsg =
  | { t: 'hello'; from: string; num: number; name: string }          // 손님 → 방장: 들어가고 싶다(1초마다, room 을 받을 때까지)
  | { t: 'deny'; to: string; reason: 'taken' | 'full' | 'closed' }   // 방장 → 손님
  | { t: 'room'; room: RoomState; roster: number[] }                  // 방장 → 모두
  | { t: 'pick'; from: string; num: number; name: string }           // 손님 → 방장: 선수 바꾸기(로비에서만)
  | { t: 'start'; config: MatchConfig; seed: number }                // 방장 → 모두
  | { t: 'in'; from: string; seq: number; i: number }                // 손님 → 방장: 입력(양자화한 숫자 하나)
  | { t: 'snap'; tick: number; state: MatchState; inputs: number[]; paused: boolean }   // 방장 → 모두, 초당 10번
  | { t: 'stop' }                                                    // 방장 → 모두: 로비로
  | { t: 'say'; from: string; id: number; k: number }                // 누구나 → 모두: 한마디(id = 경기 속 선수 id, k = 문구 번호)
  | { t: 'ping'; from: string; at: number } | { t: 'pong'; to: string; at: number }     // 손님 ↔ 방장: 왕복 시간
  | { t: 'bye'; from: string };
```
- 입력 양자화: 방향 16 + 세기 2단계(걷기·달리기) + 정지, 킥 여부 → 0~65 사이 정수 하나. 방장·봇·손님 모두 양자화한 입력으로 계산한다
  (손님의 예측과 방장의 계산이 같은 입력을 쓰게).
- 손님은 입력이 **바뀔 때만** 보내고, 안 바뀌어도 0.5초마다 한 번 보낸다. 방장은 손님이 4초 넘게 조용하면 나간 것으로 친다
  (경기 중이면 그 선수를 봇이 맡고, 로비면 명단에서 뺀다). 손님은 방장이 4초 넘게 조용하면 "방장과 연결이 끊겼습니다".

### 2.5 손님 쪽 예측 (`net.ts`, 순수)

지연이 왕복 150ms 쯤이라 받은 상태를 그대로 그리면 내 선수가 굼뜨다. 계산이 순수라서 손님도 같은 `step()` 을 돌릴 수 있다.

- 손님은 60틱 루프를 돌며 매 틱 자기 입력을 기록한다(최근 60틱).
- 새 스냅샷(방장 틱 T, 그 틱에 쓴 모든 선수의 입력)이 오면: 그 상태에서 시작해 `lead` 틱만큼 `step()` 을 다시 돌린다.
  내 자리에는 내가 기록해 둔 최근 `lead` 틱의 입력을, 다른 선수 자리에는 스냅샷에 실린 입력을 그대로 쓴다.
  `lead = clamp(round(왕복 시간 × 60), 0, 20)` — ping·pong 으로 2초마다 재고 부드럽게 평균한다.
- 스냅샷 사이에는 매 틱 예측 상태를 한 틱씩 진행한다(내 입력은 지금 것, 남은 마지막으로 안 것).
- 그리기는 예측 상태를 쓰되, 새 스냅샷으로 위치가 튀는 것을 줄이려고 화면 위치를 0.1초쯤에 걸쳐 따라가게 한다(작은 차이만 — 크게 어긋나면 바로 맞춘다).
- 점수·시간·단계(골·끝)는 스냅샷 것을 믿는다. 예측이 먼저 "골"을 띄우지 않는다.

### 2.6 방장 쪽

- 1단계 루프 그대로, 입력만 자리마다 다르게 가져온다: 내 것 = 내 조작, 봇 = `botInput`, 손님 = 마지막으로 받은 입력.
- 6틱마다(초당 10번) 스냅샷을 보낸다. 골·끝 같은 단계 전환 틱에는 바로 한 번 더 보낸다.
- 방장 화면이 가려지면(다른 앱으로 감) 경기를 멈추고 `paused` 를 실어 보낸다. 돌아오면 이어 간다. 화면에 "방장이 잠깐 자리를 비웠습니다".
- 경기가 끝나면 결과를 잠시 보여 주고 로비로 돌아간다. 방장의 ✕ 도 로비로(`stop`).

## 3. 화면

- **입장** `/game/`: 내 선수 고르기(1단계 것) + [방 만들기] / [혼자 연습](1단계 흐름 그대로). `?room=ABCD` 로 오면 선수 고르고 [들어가기].
- **방(로비)**: 주황 | 대기 | 흰 세 칸(폰에서는 세로로 쌓지 않고 한 화면에 보이게 — 칸마다 아바타·이름 칩).
  방장: 사람을 눌러 칸을 고르면 옮겨진다, [자동 나누기], 인원·시간·점수 제한, [시작], [초대 링크 복사](가능하면 공유 창).
  손님: 같은 판을 보기만 한다. "방장이 팀을 나누는 중" 안내. 자기 선수 바꾸기는 로비에서만.
  빈자리는 "봇"이라고 흐리게 표시해 시작하면 무엇이 채워질지 보이게.
- **경기**: 1단계 화면 그대로. 추가 — 한마디 버튼(문구 여섯: 나이스 / 패스! / ㅋㅋㅋ / 미안 / 가자 / 수비!) → 그 선수 머리 위 말풍선 2초.
  구경하는 사람(대기 칸)은 조작 없이 본다. 연결 상태(끊김·방장 자리 비움) 안내.
- **상단 메뉴에 「게임」** 추가(5 → 6). 게임은 탭 줄이 없다.

## 4. 범위 밖(다음)

열린 방 목록, 전적·랭킹, 자유 채팅, 방장 넘기기, 직접 연결(WebRTC), 경기 중 들어온 사람의 즉시 투입(다음 판부터 뛴다).

## 5. 확인

- 단위: 방 상태 변화(정원·중복 선수·자동 나누기·봇 채우기), 입력 양자화 왕복, 예측(지연 없는 입력이면 방장 상태와 같아짐, 내 입력 기록 재생),
  스냅샷 순서(낮은 틱 버림).
- 실제: 헤드리스 브라우저 둘(방장·손님)이 진짜 채널로 붙어 — 손님이 로비에 뜨고, 방장이 옮기고 시작하면 양쪽이 경기 화면으로,
  손님의 입력이 방장 상태에서 그 선수를 움직이고, 방장의 골이 손님 점수에 뜨고, 방장을 닫으면 손님이 안내를 받는다.
