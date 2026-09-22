import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatar, serializeAvatar, randomAvatar, avatarSpecFor, isUnsetAvatar, PARTS, UNSET_AVATAR } from '../../src/lib/avatar.ts';
import { avatarSvg, avatarFaceSvg } from '../../src/components/avatar.ts';

// 서버 검증 정규식(server/weeklyfc-apps-script.js isValidAvatarCode)을 그대로 복사한다 —
// 클라이언트가 만드는 코드가 서버에서 거부되지 않는다는 계약을 이 테스트가 지킨다.
const SERVER_CODE_RE = /^([a-z]\d{1,2}:){1,8}k#[0-9a-fA-F]{3,6}$/;

test('serializeAvatar ↔ parseAvatar 왕복: 각 부품 인덱스가 그대로 돌아온다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    for (let hair = 0; hair < PARTS.hair.length; hair++) {
      const spec = { face, hair, skin: 2, eyes: 1, jersey: 0, socks: 0, gloves: 0, tape: 0, kit: '#1a2b3c' };
      const code = serializeAvatar(spec);
      assert.deepEqual(parseAvatar(code), spec);
      assert.equal(serializeAvatar(parseAvatar(code)), code);
    }
  }
});

// 2026-09-22 축구 테마 확장 — 유니폼 무늬·양말·장갑·손목테이프 네 필드도 같은 왕복이 성립해야 한다.
test('serializeAvatar ↔ parseAvatar 왕복: 축구 테마 네 필드도 그대로 돌아온다', () => {
  for (let jersey = 0; jersey < PARTS.jersey.length; jersey++) {
    for (let socks = 0; socks < PARTS.socks.length; socks++) {
      for (let gloves = 0; gloves < PARTS.gloves.length; gloves++) {
        for (let tape = 0; tape < PARTS.tape.length; tape++) {
          const spec = { face: 0, hair: 0, skin: 0, eyes: 0, jersey, socks, gloves, tape, kit: '#1a2b3c' };
          const code = serializeAvatar(spec);
          assert.deepEqual(parseAvatar(code), spec);
          assert.equal(serializeAvatar(parseAvatar(code)), code);
        }
      }
    }
  }
});

test('parseAvatar: 옛 4세그먼트 코드(축구 테마 확장 이전)도 하위 호환 — 새 필드는 기본값 0', () => {
  const spec = parseAvatar('f2:h3:s1:e0:k#2980b9');
  assert.equal(isUnsetAvatar(spec), false);
  assert.deepEqual(spec, { face: 2, hair: 3, skin: 1, eyes: 0, kit: '#2980b9', jersey: 0, socks: 0, gloves: 0, tape: 0 });
  // 다시 저장하면 8세그먼트(j/o/g/t 포함) 코드가 되지만, 서버 정규식은 여전히 통과한다.
  const resaved = serializeAvatar(spec);
  assert.equal(resaved, 'f2:h3:s1:e0:j0:o0:g0:t0:k#2980b9');
  assert.match(resaved, SERVER_CODE_RE);
});

test('parseAvatar: 빈 문자열·null·undefined는 미설정(UNSET_AVATAR)', () => {
  assert.deepEqual(parseAvatar(''), UNSET_AVATAR);
  assert.deepEqual(parseAvatar('   '), UNSET_AVATAR);
  assert.deepEqual(parseAvatar(undefined), UNSET_AVATAR);
  assert.deepEqual(parseAvatar(null), UNSET_AVATAR);
  assert.equal(isUnsetAvatar(parseAvatar('')), true);
});

test('parseAvatar: 형식 자체가 깨진 값도 죽지 않고 미설정으로 떨어진다 (관용)', () => {
  for (const garbage of ['안녕하세요', 'not-a-code', 'f2:h5', 'k#zzzzzz', '../../etc/passwd', ';DROP TABLE;', 'f2:h5:s3:e1:k#12', '   f2:h5:s3:e1:k#1a1a1a extra   ']) {
    const spec = parseAvatar(garbage);
    assert.equal(isUnsetAvatar(spec), true, `"${garbage}" → 미설정이어야 함`);
  }
});

test('parseAvatar: 모양은 맞지만 범위 밖 인덱스·모르는 글자는 조용히 보정한다', () => {
  // f99 → PARTS.face.length로 모듈러 클램프. z9 → 우리 어휘에 없는 글자라 무시(기본값 0 유지).
  const spec = parseAvatar('f99:h50:z9:s30:e10:k#123456');
  assert.equal(isUnsetAvatar(spec), false);
  assert.ok(spec.face >= 0 && spec.face < PARTS.face.length);
  assert.ok(spec.hair >= 0 && spec.hair < PARTS.hair.length);
  assert.ok(spec.skin >= 0 && spec.skin < PARTS.skin.length);
  assert.ok(spec.eyes >= 0 && spec.eyes < PARTS.eyes.length);
  assert.equal(spec.kit, '#123456');
  // 같은 입력은 같은 결과 — 관용적 보정도 결정적이어야 한다.
  assert.deepEqual(parseAvatar('f99:h50:z9:s30:e10:k#123456'), spec);
});

test('parseAvatar: 축구 테마 네 필드도 범위 밖 인덱스를 조용히 보정한다', () => {
  const spec = parseAvatar('f0:h0:s0:e0:j99:o99:g99:t99:k#123456');
  assert.equal(isUnsetAvatar(spec), false);
  assert.ok(spec.jersey >= 0 && spec.jersey < PARTS.jersey.length);
  assert.ok(spec.socks >= 0 && spec.socks < PARTS.socks.length);
  assert.ok(spec.gloves >= 0 && spec.gloves < PARTS.gloves.length);
  assert.ok(spec.tape >= 0 && spec.tape < PARTS.tape.length);
});

test('parseAvatar: 3~5자리 hex도 유효한 6자리 hex로 정규화한다', () => {
  assert.equal(parseAvatar('f0:h0:s0:e0:k#abc').kit, '#aabbcc');
  assert.match(parseAvatar('f0:h0:s0:e0:k#abcd').kit, /^#[0-9a-f]{6}$/);
  assert.match(parseAvatar('f0:h0:s0:e0:k#abcde').kit, /^#[0-9a-f]{6}$/);
});

test('randomAvatar: 같은 시드는 항상 같은 결과 (결정적)', () => {
  for (const seed of [1, 9, 17, 30, 99]) {
    assert.deepEqual(randomAvatar(seed), randomAvatar(seed));
  }
});

test('randomAvatar: 선수 30명(1~30번)이 서로 다른 아바타를 받는다', () => {
  const codes = new Set();
  for (let num = 1; num <= 30; num++) codes.add(serializeAvatar(randomAvatar(num)));
  assert.equal(codes.size, 30, '30명 코드가 전부 달라야 함(겹치면 "다들 비슷해 보인다" 문제 재발)');
});

test('randomAvatar: 매번 미설정이 아닌 실제 스펙을 낸다', () => {
  for (let num = 1; num <= 30; num++) assert.equal(isUnsetAvatar(randomAvatar(num)), false);
});

test('serializeAvatar 출력은 항상 서버 정규식을 통과한다 (계약)', () => {
  // randomAvatar 30명분
  for (let num = 1; num <= 30; num++) assert.match(serializeAvatar(randomAvatar(num)), SERVER_CODE_RE);
  // PARTS 전 조합의 극단값(0과 끝값)도 확인
  const idx = (len) => [0, len - 1];
  for (const face of idx(PARTS.face.length)) for (const hair of idx(PARTS.hair.length)) for (const skin of idx(PARTS.skin.length)) for (const eyes of idx(PARTS.eyes.length)) {
    const code = serializeAvatar({ face, hair, skin, eyes, kit: '#ffffff' });
    assert.match(code, SERVER_CODE_RE);
  }
  // 축구 테마 네 필드의 극단값도 — 8세그먼트를 다 채워도 여전히 정규식(최대 8개)을 통과해야 한다.
  for (const jersey of idx(PARTS.jersey.length)) for (const socks of idx(PARTS.socks.length)) for (const gloves of idx(PARTS.gloves.length)) for (const tape of idx(PARTS.tape.length)) {
    const code = serializeAvatar({ face: 0, hair: 0, skin: 0, eyes: 0, jersey, socks, gloves, tape, kit: '#ffffff' });
    assert.match(code, SERVER_CODE_RE);
  }
  // UNSET_AVATAR는 빈 문자열 — 서버 계약상 빈 값은 "기본으로 되돌리기"로 허용된다(정규식 밖이 맞음).
  assert.equal(serializeAvatar(UNSET_AVATAR), '');
});

test('avatarSpecFor: 저장된 코드가 없으면 randomAvatar, 있으면 parseAvatar와 같은 결과', () => {
  assert.deepEqual(avatarSpecFor(9, ''), randomAvatar(9));
  assert.deepEqual(avatarSpecFor(9, undefined), randomAvatar(9));
  const code = serializeAvatar({ face: 1, hair: 2, skin: 3, eyes: 4, kit: '#112233' });
  assert.deepEqual(avatarSpecFor(9, code), parseAvatar(code));
});

test('avatarSvg: size는 세로 길이이고 가로는 3:4로 따라온다', () => {
  const svg = avatarSvg(randomAvatar(9), 32);
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="24" height="32"/);
});

test('avatarSvg: 미설정 스펙은 번호만 든 칸으로 폴백한다', () => {
  const svg = avatarSvg(UNSET_AVATAR, 120, 9);
  assert.match(svg, /^<svg /);
  assert.match(svg, />9</);
});

test('avatarSvg: 부품이 다르면 출력도 달라진다 (30명이 뭉개지지 않는다는 최소 보장)', () => {
  const svgs = new Set();
  for (let num = 1; num <= 30; num++) svgs.add(avatarSvg(randomAvatar(num), 28));
  assert.equal(svgs.size, 30);
});

test('avatarSvg: shape-rendering=crispEdges가 걸려 있다 (벡터 픽셀아트 앤티앨리어싱 방지)', () => {
  const svg = avatarSvg(randomAvatar(1), 32);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test('avatarSvg: 얼굴형 5종 전부 유효한 SVG를 낸다 (다이아몬드 포함, 깨지지 않음)', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    const svg = avatarSvg({ face, hair: 0, skin: 0, eyes: 0, kit: '#2980b9' }, 32);
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
  }
});

test('avatarSvg: 헤어 8종 전부(아프로 포함) 유효한 SVG를 낸다', () => {
  for (let hair = 0; hair < PARTS.hair.length; hair++) {
    const svg = avatarSvg({ face: 0, hair, skin: 0, eyes: 0, kit: '#2980b9' }, 32);
    assert.match(svg, /^<svg /);
  }
});

test('avatarFaceSvg: 얼굴 크롭은 정사각이고 머리 창만 본다', () => {
  const svg = avatarFaceSvg(randomAvatar(9), 32);
  assert.match(svg, /width="32" height="32"/);
  assert.match(svg, /viewBox="4 0 16 16"/);
});

test('avatarSvg: 같은 입력이면 항상 같은 문자열 (결정적 — dangerouslySetInnerHTML 계약)', () => {
  const spec = randomAvatar(7);
  assert.equal(avatarSvg(spec, 112), avatarSvg(spec, 112));
  assert.equal(avatarFaceSvg(spec, 32), avatarFaceSvg(spec, 32));
});

test('avatarSvg: 좌표가 전부 정수다 (픽셀 격자가 깨지지 않는다)', () => {
  const svg = avatarSvg(randomAvatar(3), 112);
  for (const m of svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)) {
    assert.ok(!m[1].includes('.'), `소수 좌표가 있다: ${m[0]}`);
  }
});

test('avatarSvg: 유니폼 색이 저장된 kit hex 그대로 칠해진다', () => {
  const svg = avatarSvg({ face: 0, hair: 1, skin: 0, eyes: 0, kit: '#2980b9' }, 112);
  assert.ok(svg.includes('fill="#2980b9"'), '유니폼 색이 안 들어갔다');
});

test('avatarSvg: 부품 조합 전수 — 5×8×3 전부 유효한 SVG를 낸다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    for (let hair = 0; hair < PARTS.hair.length; hair++) {
      for (let eyes = 0; eyes < PARTS.eyes.length; eyes++) {
        const svg = avatarSvg({ face, hair, skin: 2, eyes, kit: '#2980b9' }, 112);
        assert.match(svg, /^<svg /);
        assert.match(svg, /<\/svg>$/);
        assert.ok(!svg.includes('undefined'), `undefined 이 출력에 섞였다 (face=${face} hair=${hair} eyes=${eyes})`);
      }
    }
  }
});

// ── 2026-09-22 축구 테마 확장(유니폼 무늬·양말·장갑·손목테이프) ──────────────

test('avatarSvg: 유니폼 무늬 4종(솔리드·스트라이프·후프·긴팔) 전부 유효한 SVG를 낸다', () => {
  for (let jersey = 0; jersey < PARTS.jersey.length; jersey++) {
    const svg = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey, kit: '#2980b9' }, 112);
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.ok(!svg.includes('undefined'), `undefined 이 출력에 섞였다 (jersey=${jersey})`);
  }
});

test('avatarSvg: 유니폼 무늬가 다르면(솔리드 vs 나머지) 출력도 달라진다', () => {
  const solid = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey: 0, kit: '#2980b9' }, 112);
  for (let jersey = 1; jersey < PARTS.jersey.length; jersey++) {
    const svg = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey, kit: '#2980b9' }, 112);
    assert.notEqual(svg, solid, `jersey=${jersey} 가 솔리드와 같은 출력을 냈다`);
  }
});

test('avatarSvg: 양말은 "유니폼과 같음"(o0)이면 kit 색, 아니면 지정 색으로 칠해진다', () => {
  const auto = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, socks: 0, kit: '#2980b9' }, 112);
  assert.ok(auto.includes('fill="#2980b9"'), '유니폼과 같음인데 kit 색이 안 들어갔다');
  const white = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, socks: 1, kit: '#2980b9' }, 112);
  assert.ok(white.includes(`fill="${PARTS.socks[1].color}"`), '지정한 양말 색이 안 들어갔다');
});

test('avatarSvg: 장갑이 없으면(g0) 손이 피부색, 있으면 지정 색이 섞인다', () => {
  const none = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, gloves: 0, kit: '#2980b9' }, 112);
  const black = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, gloves: 1, kit: '#2980b9' }, 112);
  assert.notEqual(none, black, '장갑 유무가 출력에 반영되지 않았다');
  assert.ok(black.includes(`fill="${PARTS.gloves[1].color}"`), '장갑 색이 안 들어갔다');
});

test('avatarSvg: 손목테이프가 없으면(t0) 팔이 피부색, 있으면 지정 색이 섞인다', () => {
  const none = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, tape: 0, kit: '#2980b9' }, 112);
  const white = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, tape: 1, kit: '#2980b9' }, 112);
  assert.notEqual(none, white, '손목테이프 유무가 출력에 반영되지 않았다');
  assert.ok(white.includes(`fill="${PARTS.tape[1].color}"`), '손목테이프 색이 안 들어갔다');
});

test('avatarSvg: 유니폼 무늬·양말·장갑·손목테이프 조합 전수 — undefined 안 섞이고 좌표는 정수', () => {
  for (let jersey = 0; jersey < PARTS.jersey.length; jersey++) {
    for (let socks = 0; socks < PARTS.socks.length; socks++) {
      for (let gloves = 0; gloves < PARTS.gloves.length; gloves++) {
        for (let tape = 0; tape < PARTS.tape.length; tape++) {
          const svg = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey, socks, gloves, tape, kit: '#2980b9' }, 112);
          assert.match(svg, /^<svg /);
          assert.ok(!svg.includes('undefined'), `undefined 섞임 (j=${jersey} o=${socks} g=${gloves} t=${tape})`);
          for (const m of svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)) {
            assert.ok(!m[1].includes('.'), `소수 좌표: ${m[0]} (j=${jersey} o=${socks} g=${gloves} t=${tape})`);
          }
        }
      }
    }
  }
});

test('randomAvatar: 장갑·손목테이프는 대부분 "없음"에 치우쳐 뽑히되, 가끔은 뽑힌다', () => {
  const gloves = []; const tape = [];
  for (let num = 1; num <= 300; num++) { const a = randomAvatar(num); gloves.push(a.gloves); tape.push(a.tape); }
  const noneRatio = (xs) => xs.filter((x) => x === 0).length / xs.length;
  // 진짜 비율은 설계상 0.85 근처지만, 구현 상수가 바뀌어도 이 테스트가 안 깨지게 넉넉히 잡는다.
  assert.ok(noneRatio(gloves) > 0.5, `장갑 "없음" 비율이 너무 낮다: ${noneRatio(gloves)}`);
  assert.ok(noneRatio(tape) > 0.5, `손목테이프 "없음" 비율이 너무 낮다: ${noneRatio(tape)}`);
  assert.ok(gloves.some((g) => g !== 0), '300명 중 장갑을 낀 사람이 한 명도 없다');
  assert.ok(tape.some((t) => t !== 0), '300명 중 손목테이프를 한 사람이 한 명도 없다');
});

test('avatarFaceSvg: 얼굴 크롭(0~15행)에도 축구 테마 필드가 섞여도 깨지지 않는다', () => {
  // 크롭 창이 13~15행(유니폼 무늬 자리)까지 걸치므로 이 필드들도 얼굴 칩에서 렌더될 수 있다.
  const svg = avatarFaceSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey: 2, socks: 3, gloves: 1, tape: 1, kit: '#2980b9' }, 32);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.ok(!svg.includes('undefined'));
});

test('randomAvatar: 유니폼 무늬·양말은 골고루 뽑힌다(0번에 안 쏠림)', () => {
  const jerseys = new Set(); const socks = new Set();
  for (let num = 1; num <= 30; num++) { const a = randomAvatar(num); jerseys.add(a.jersey); socks.add(a.socks); }
  assert.ok(jerseys.size > 1, '30명이 전부 같은 유니폼 무늬를 받았다');
  assert.ok(socks.size > 1, '30명이 전부 같은 양말 색을 받았다');
});

