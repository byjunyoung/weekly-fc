# 도트 리프레시 4c단계(표 본문) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** antd 표 **본문**도 갈무리 20px로 맞춘다. 4b에서 표 머리·뱃지는 도트가 됐지만 본문(이름·날짜·금액)은 Pretendard로 남아, 같은 선수 이름이 목록 뷰에선 도트·표 뷰에선 보통 글꼴로 갈려 있었다. 사용자가 "표도 도트로 맞춰줘"로 이 어긋남을 없애기로 했다.

**Architecture:** 크기는 `theme.ts`의 `Table.cellFontSizeSM`, 글꼴은 `tokens.css`의 antd 블록. 4b에서 세운 "크기는 theme, 글꼴은 tokens" 규칙을 그대로 따른다. 표 안의 「넣기/선발」 버튼은 `.wfc` 안이라 전역 button 규칙에서 제외돼 UA 기본 글꼴로 떨어져 있는데(4b 리뷰가 기존 결함으로 지적), 주변이 전부 도트가 된 지금은 눈에 띄므로 같이 맞춘다.

**Tech Stack:** Astro + React 19 + antd, CSS 토큰. 헤드리스 Chrome(CDP)으로 실측.

**Spec:** `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` — §9(4b단계)의 "표 본문의 이름·날짜 같은 내용은 Pretendard" 방침을 **이번에 뒤집는다**(아래 Step 4에서 스펙에 기록).

## Global Constraints

- 갈무리를 새로 거는 **모든** 선택자에 `font-synthesis: none`·`letter-spacing: 0`·`--fw-body`. 크기는 `--fs-pixel-*`만.
- **크기를 두 군데서 정하지 않는다** — 표 본문 크기는 `theme.ts`, 글꼴은 `tokens.css`.
- 긴 한글 본문(운영 규칙 문단)은 여전히 Pretendard다. 이번에 바뀌는 건 **표 안의 짧은 값**뿐이다.
- 마크업·동작 변경 금지. 새 의존성 금지. `npm test` 통과(4b에서 넣은 도트 규약 테스트 포함).

---

### Task 1: 표 본문을 도트로

**Files:**
- Modify: `src/react/theme.ts` (`Table.cellFontSizeSM`, 위 주석)
- Modify: `src/styles/tokens.css` (antd 블록에 선택자 추가)
- Modify: `docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` (방침 뒤집힘 기록)

**Interfaces:** 없음(표현 말단).

- [ ] **Step 1: `theme.ts` — 표 본문 크기**

바꾸기 전:
```ts
      borderColor: 'rgba(229, 229, 229, .2)', headerSplitColor: 'transparent', cellFontSizeSM: 14,
```
바꾼 뒤:
```ts
      borderColor: 'rgba(229, 229, 229, .2)', headerSplitColor: 'transparent', cellFontSizeSM: 20,
```

바로 위 주석에 "14px 글자·줄높이(약 22px)에 13씩 더해 줄 높이 `--row-h`(48px)에 맞춘다"는 계산이 적혀 있다. 글자가 20px가 되면 이 계산이 더 이상 안 맞으므로, **실측한 실제 줄 높이로 문장을 고친다**(Step 3에서 잰 값을 쓴다).

- [ ] **Step 2: `tokens.css` — 표 본문 글꼴**

4b가 만든 antd 블록에 `.ant-table-tbody td`를 **더한다**(새 블록을 만들지 않는다). 아울러 표 안의 「넣기/선발」 버튼도 같이 맞춘다 — 이 버튼은 `.wfc` 안이라 전역 `button` 규칙의 `:not(.wfc, .wfc *)` 제외에 걸려 UA 기본 글꼴로 떨어져 있다.

블록의 첫 규칙 선택자 목록에 `.ant-table-tbody td`를 더하고, 크기 규칙 줄에도 `.ant-table-tbody td`를 더한다. 그리고 아래 규칙을 블록 끝에 추가한다:

```css
/* 표 안의 「넣기/선발」 — .wfc 안이라 전역 button 규칙에서 제외돼 UA 기본 글꼴로 떨어진다. */
.wfc .ant-table-tbody button:not(.ant-btn) {
  font-family: var(--font-pixel); font-size: var(--fs-pixel-sm); font-weight: var(--fw-body); font-synthesis: none; letter-spacing: 0;
}
```

- [ ] **Step 3: 실측 — 표가 이번 변경의 유일한 위험이다**

```bash
npm run build && npm run preview
```
(포트는 preview 출력에서 읽는다. base 경로는 `/weekly-fc`.)

스쿼드 표 뷰에서 잰다(이 페이지엔 `.chips` 세그먼트 그룹이 둘이라 **「표」를 텍스트로 찾아** 클릭한다):
```js
export default async function (c, check) {
  const co = JSON.parse(await c.evaluate(`(() => { const el = [...document.querySelectorAll('.ant-segmented-item')].find(e => e.textContent.trim() === '표'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify([r.left+r.width/2, r.top+r.height/2]); })()`));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: co[0], y: co[1], button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: co[0], y: co[1], button: 'left', buttons: 0, clickCount: 1 });
  await c.sleep(800);
  const got = await c.evaluate(`JSON.stringify({
    pageScrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    tblScrollW: document.querySelector('.ant-table-content')?.scrollWidth ?? -1,
    tblClientW: document.querySelector('.ant-table-content')?.clientWidth ?? -1,
    rowH: Math.round(document.querySelector('.ant-table-tbody tr')?.getBoundingClientRect().height ?? -1),
    cell: (() => { const td = document.querySelector('.ant-table-tbody td'); const cs = getComputedStyle(td); return cs.fontFamily.split(',')[0] + ' ' + cs.fontSize; })(),
    pickBtn: (() => { const b = document.querySelector('.ant-table-tbody button'); if (!b) return 'no-el'; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return cs.fontFamily.split(',')[0] + ' ' + cs.fontSize + ' h' + Math.round(r.height) + ' sh' + b.scrollHeight; })()
  })`);
  check('표 본문', true, got);
}
```

판단 기준:
- `cell`이 `Galmuri9 20px`, `pickBtn`도 `Galmuri9 20px`여야 한다.
- `pickBtn`의 `h`가 `sh`보다 작으면 글자가 세로로 잘린 것 — 보고에 적는다.
- **`pageScrollW === innerW`여야 한다.** 표가 자기 안에서 가로로 스크롤되는 것(`tblScrollW > tblClientW`)은 원래 허용이다.
- `rowH`가 커진 값을 기록한다(Step 1의 주석 문장에 쓸 값이다).

**페이지가 가로로 넘치면**, 표 본문만 되돌린다 — `.ant-table-tbody td`를 선택자 목록에서 빼고 `cellFontSizeSM`을 14로 되돌린 뒤 다시 잰다. 어느 쪽을 택했는지 보고에 명시한다.

운영 페이지(`/weekly-fc/rules/`)의 표 셋(벌금 기준표·미납 현황·벌금 내역)과 선수 상세의 벌금 내역도 같은 기준으로 확인한다 — 날짜(`2026-09-12`)·금액(`30,000원`)이 20px가 되면서 칸이 넘치지 않는지.

- [ ] **Step 4: 스펙에 방침 뒤집힘 기록**

`docs/superpowers/specs/2026-09-21-pixel-refresh-design.md` 맨 아래에 짧게 추가한다 — §9가 "표 본문의 이름·날짜 같은 내용은 Pretendard"라고 적어 둔 것을 이번에 뒤집었다는 사실과 이유(같은 선수 이름이 목록 뷰와 표 뷰에서 다른 글꼴로 보이는 어긋남을 없애려고, 사용자 지시), 그리고 **긴 한글 본문은 여전히 Pretendard라는 원칙 자체는 유지된다**는 점을 남긴다. 문서의 기존 말투를 따른다.

- [ ] **Step 5: 눈으로 확인 + 테스트 + 커밋**

스쿼드 표·운영 표·선수 상세를 데스크톱(1280)과 모바일(390)로 찍어 본다. 확인할 것:
- 표 본문의 이름·날짜·금액이 도트로 **또렷하다**(흐리면 크기가 10의 배수를 벗어난 것이다).
- 「넣기/선발」 버튼이 주변과 같은 글꼴이다.
- 목록 뷰와 표 뷰에서 **같은 선수 이름이 같은 글꼴로** 보인다 — 이게 이번 변경의 목적이다.
- 끝나면 서버를 종료한다.

```bash
npm test
git add src/react/theme.ts src/styles/tokens.css docs/superpowers/specs/2026-09-21-pixel-refresh-design.md
git commit -m "$(cat <<'MSG'
style: 표 본문도 갈무리 20px — 목록·표에서 이름 글꼴이 갈리던 것 해소

4b 가 표 머리·뱃지만 도트로 바꿔 같은 선수 이름이 목록 뷰에선 도트, 표
뷰에선 Pretendard 로 갈려 있었다. 표 안 「넣기/선발」 버튼도 .wfc 제외에
걸려 UA 기본 글꼴이던 것을 같이 맞춘다. 긴 한글 본문은 여전히 Pretendard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4
MSG
)"
```

---

## Controller 최종 검증

- `npm test` 전체 통과(4b의 도트 규약 테스트 포함).
- 스쿼드 표에서 페이지 가로 스크롤이 생기지 않았는지.
- 목록↔표 전환 시 이름 글꼴이 같은지 직접 확인.
