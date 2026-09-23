import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatar, serializeAvatar, randomAvatar, avatarSpecFor, isUnsetAvatar, PARTS, UNSET_AVATAR } from '../../src/lib/avatar.ts';
import { avatarSvg, avatarFaceSvg } from '../../src/components/avatar.ts';

// 서버 검증 정규식(server/weeklyfc-apps-script.js isValidAvatarCode)을 그대로 복사한다 —
// 클라이언트가 만드는 코드가 서버에서 거부되지 않는다는 계약을 이 테스트가 지킨다.
const SERVER_CODE_RE = /^([a-z]\d{1,2}:){1,16}k#[0-9a-fA-F]{3,6}$/;

test('serializeAvatar ↔ parseAvatar 왕복: 각 부품 인덱스가 그대로 돌아온다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    for (let hair = 0; hair < PARTS.hair.length; hair++) {
      const spec = { face, hair, skin: 2, eyes: 1, jersey: 0, socks: 0, gloves: 0, tape: 0, hairColor: 0, beard: 0, acc: 0, shorts: 0, boots: 0, kit: '#1a2b3c' };
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
          const spec = { face: 0, hair: 0, skin: 0, eyes: 0, jersey, socks, gloves, tape, hairColor: 0, beard: 0, acc: 0, shorts: 0, boots: 0, kit: '#1a2b3c' };
          const code = serializeAvatar(spec);
          assert.deepEqual(parseAvatar(code), spec);
          assert.equal(serializeAvatar(parseAvatar(code)), code);
        }
      }
    }
  }
});

test('serializeAvatar ↔ parseAvatar 왕복: 새 부위 다섯의 모든 값', () => {
  for (const field of ['hairColor', 'beard', 'acc', 'shorts', 'boots']) {
    for (let v = 0; v < PARTS[field].length; v++) {
      const spec = { ...parseAvatar('f1:h2:s3:e4:j1:o1:g1:t1:k#1a2b3c'), [field]: v };
      const code = serializeAvatar(spec);
      assert.deepEqual(parseAvatar(code), spec, `${field}=${v}: ${code}`);
    }
  }
});

test('parseAvatar: 옛 4세그먼트 코드(축구 테마 확장 이전)도 하위 호환 — 새 필드는 기본값 0', () => {
  const spec = parseAvatar('f2:h3:s1:e0:k#2980b9');
  assert.equal(isUnsetAvatar(spec), false);
  assert.deepEqual(spec, { face: 2, hair: 3, skin: 1, eyes: 0, kit: '#2980b9', jersey: 0, socks: 0, gloves: 0, tape: 0, hairColor: 0, beard: 0, acc: 0, shorts: 0, boots: 0 });
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

test('avatarSvg: 스트라이프(j1)는 몸통 중심(열 11.5)에 대칭이고 옷깃과 안 겹친다 (회귀 방지)', () => {
  // 첫 구현은 열 8·12·16(비대칭 + 옷깃 D 와 12에서 겹침)이었다가, opus 리뷰가 실측으로
  // 잡아 7·10·13·16으로 고쳤다. 13행(옷깃이 없는 순수 몸통 줄)에서 D 가 그 네 열에만
  // 찍히는지 좌표로 확인한다 — 이후 다시 밀려도 이 테스트가 잡는다.
  const kit = '#2980b9';
  const svg = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, jersey: 1, kit }, 112);
  const dark = shade07(kit);
  for (const x of [7, 10, 13, 16]) assert.equal(rectAt(svg, x, 13), dark, `13행 x=${x} 가 스트라이프 색이 아니다`);
  // 대칭 확인 — 몸통 열 5~18의 미러(23-x)도 같은 집합이어야 한다.
  assert.deepEqual([7, 10, 13, 16].map((x) => 23 - x).sort((a, b) => a - b), [7, 10, 13, 16]);
  // 스트라이프 사이(열 8·9·11·12·14·15)는 여전히 kit 색 — 8은 병합된 kit rect 안에 있다.
  assert.equal(rectAt(svg, 8, 13), kit, '스트라이프 사이가 kit 색이 아니다');
});

// 아래 세 테스트는 색 문자열이 출력 어딘가에 있는지가 아니라, **그 부위의 실제 좌표에
// 찍힌 rect의 fill**을 확인한다 — 장갑 블랙(#1a1a1a)이 축구화(B) 색과 같은 것처럼, 이
// 팔레트엔 우연히 같은 색을 쓰는 슬롯이 있어 "색이 출력에 있다"만으론 그 부위가 실제로
// 그려졌는지 증명하지 못한다(opus 리뷰가 잡은 공허한 단언).
const rectAt = (svg, x, y) => new RegExp(`<rect x="${x}" y="${y}" width="\\d+" height="1" fill="([^"]+)"/>`).exec(svg)?.[1];
// components/avatar.ts의 shade()를 그대로 복사한다 — SERVER_CODE_RE와 같은 이유로,
// 계약(D = kit의 0.7배 밝기)을 이 테스트가 직접 들고 있어야 구현이 갈라져도 잡힌다.
const shade07 = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const part = (v) => Math.min(255, Math.round(v * 0.7)).toString(16).padStart(2, '0');
  return `#${part((n >> 16) & 255)}${part((n >> 8) & 255)}${part(n & 255)}`;
};

test('avatarSvg: 양말은 "유니폼과 같음"(o0)이면 kit 색, 아니면 지정 색으로 칠해진다 (26행 좌표로 확인)', () => {
  const auto = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, socks: 0, kit: '#2980b9' }, 112);
  assert.equal(rectAt(auto, 8, 26), '#2980b9', '유니폼과 같음인데 26행 양말 rect 색이 kit 이 아니다');
  const white = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, socks: 1, kit: '#2980b9' }, 112);
  assert.equal(rectAt(white, 8, 26), PARTS.socks[1].color, '지정한 양말 색이 26행 rect 에 없다');
});

test('avatarSvg: 장갑이 없으면(g0) 19행 손 rect가 피부색, 있으면 지정 색이다 (좌표로 확인)', () => {
  const skin = PARTS.skin[0].color;
  const none = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, gloves: 0, kit: '#2980b9' }, 112);
  assert.equal(rectAt(none, 6, 19), skin, '장갑 없음인데 19행 손 rect가 피부색이 아니다');
  const black = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, gloves: 1, kit: '#2980b9' }, 112);
  assert.equal(rectAt(black, 6, 19), PARTS.gloves[1].color, '장갑 색이 19행 손 rect에 없다(좌우 중 왼쪽)');
  assert.equal(rectAt(black, 17, 19), PARTS.gloves[1].color, '장갑 색이 19행 손 rect에 없다(오른쪽)');
});

test('avatarSvg: 손목테이프가 없으면(t0) 18행 손목 rect가 피부색, 있으면 지정 색이다 (좌표로 확인)', () => {
  const skin = PARTS.skin[0].color;
  const none = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, tape: 0, kit: '#2980b9' }, 112);
  assert.equal(rectAt(none, 5, 18), skin, '테이프 없음인데 18행 손목 rect가 피부색이 아니다');
  const white = avatarSvg({ face: 0, hair: 0, skin: 0, eyes: 0, tape: 1, kit: '#2980b9' }, 112);
  assert.equal(rectAt(white, 5, 18), PARTS.tape[1].color, '테이프 색이 18행 손목 rect(왼쪽)에 없다');
  assert.equal(rectAt(white, 17, 18), PARTS.tape[1].color, '테이프 색이 18행 손목 rect(오른쪽)에 없다');
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

test('randomAvatar: 축구 테마 네 필드를 추가하면서도 face·hair·skin·eyes·kit 은 그대로다 (회귀 방지)', () => {
  // 2026-09-22 축구 테마 확장 때 새 네 픽을 hue 추첨보다 앞에 끼워 넣는 바람에 난수
  // 스트림이 밀려, 아바타를 한 번도 저장하지 않은 기존 선수 전원의 유니폼 색이 바뀔
  // 뻔했다(opus 리뷰가 실측으로 잡음). 이 값들은 그 사고 이전 알고리즘(face→hair→skin→
  // eyes→hue 순, 새 필드는 그 뒤)으로 직접 계산한 고정값이다 — 앞으로 다시 순서가
  // 밀리면 이 테스트가 바로 깨진다.
  const fixed = {
    1: { face: 3, hair: 0, skin: 3, eyes: 5, kit: '#a63048' },
    7: { face: 0, hair: 0, skin: 5, eyes: 4, kit: '#3098a6' },
    9: { face: 0, hair: 6, skin: 0, eyes: 4, kit: '#5730a6' },
    30: { face: 4, hair: 6, skin: 2, eyes: 1, kit: '#a6a030' },
  };
  for (const [seed, expected] of Object.entries(fixed)) {
    const a = randomAvatar(Number(seed));
    assert.deepEqual({ face: a.face, hair: a.hair, skin: a.skin, eyes: a.eyes, kit: a.kit }, expected, `seed ${seed}`);
  }
});

test('randomAvatar: 유니폼 무늬·양말은 골고루 뽑힌다(0번에 안 쏠림)', () => {
  const jerseys = new Set(); const socks = new Set();
  for (let num = 1; num <= 30; num++) { const a = randomAvatar(num); jerseys.add(a.jersey); socks.add(a.socks); }
  assert.ok(jerseys.size > 1, '30명이 전부 같은 유니폼 무늬를 받았다');
  assert.ok(socks.size > 1, '30명이 전부 같은 양말 색을 받았다');
});


// ── 2026-09-23 꾸미기 고도화: 머리색·수염·액세서리·반바지·축구화 ──────────────
import { readFileSync as readFs } from 'node:fs';
import { avatarPixels } from '../../src/components/avatar.ts';

test('앱과 서버의 아바타 코드 정규식이 같다 — 파일에서 직접 읽어 대조', () => {
  // 복사본끼리 비교하면 한쪽만 고쳐도 안 걸린다. 두 파일의 실제 정규식을 꺼내 맞춘다.
  const client = /const CODE_SHAPE = (\/.+\/);/.exec(readFs('src/lib/avatar.ts', 'utf8'))[1];
  const server = /return (\/\^\(\[a-z\].+\/)\.test\(code\)/.exec(readFs('server/weeklyfc-apps-script.js', 'utf8'))[1];
  assert.equal(server, client);
  assert.equal(client, String(SERVER_CODE_RE));
});

test('새 부위를 안 쓰면 코드에 적히지 않는다 — 기존 코드·기본 아바타가 그대로', () => {
  for (let n = 1; n <= 30; n++) {
    const code = serializeAvatar(randomAvatar(n));
    assert.doesNotMatch(code, /(^|:)[cbapz]\d/, `${n}번 기본 아바타 코드에 새 부위가 섞였다: ${code}`);
  }
  const old = 'f2:h1:s1:e3:j0:o2:g0:t0:k#7f8c8d';
  assert.equal(serializeAvatar(parseAvatar(old)), old);
});

test('새 부위 왕복 — 적고 다시 읽으면 같고, 서버 규칙·길이를 통과한다', () => {
  const spec = { ...parseAvatar('f4:h7:s5:e5:j3:o5:g3:t2:k#ecf0f1'), hairColor: 9, beard: 3, acc: 3, shorts: 4, boots: 4 };
  const code = serializeAvatar(spec);
  assert.match(code, /c9:b3:a3:p4:z4:k#/);
  assert.match(code, SERVER_CODE_RE);
  assert.ok(code.length <= 120, `코드가 서버 상한 120자를 넘는다: ${code.length}`);
  const back = parseAvatar(code);
  for (const k of ['hairColor', 'beard', 'acc', 'shorts', 'boots']) assert.equal(back[k], spec[k], k);
});

const px = (over) => avatarPixels({ ...parseAvatar('f0:h1:s0:e0:j0:o0:g0:t0:k#c0392b'), ...over });

test('덥수룩한 수염은 얼굴형 다섯 모두에서 얼굴 밖으로 안 나가고 입을 남긴다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    const bare = px({ face, beard: 0, hair: 0 }).map;
    const full = px({ face, beard: 3, hair: 0 }).map;
    let beardCells = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) {
      if (full[y][x] !== 'R') continue;
      beardCells++;
      assert.equal(bare[y][x], 'S', `얼굴형 ${face}: (${x},${y}) 수염이 피부 밖에 그려졌다`);
    }
    assert.ok(beardCells > 10, `얼굴형 ${face}: 수염이 거의 없다(${beardCells}칸)`);
    assert.notEqual(full[9][11], 'R', `얼굴형 ${face}: 입이 수염에 덮였다`);
    assert.notEqual(full[9][12], 'R');
  }
});

test('콧수염·턱수염은 얼굴형 다섯 모두의 피부 위에만', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    const bare = px({ face, hair: 0 }).map;
    for (const beard of [1, 2]) {
      const m = px({ face, hair: 0, beard }).map;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) if (m[y][x] === 'R') assert.equal(bare[y][x], 'S', `얼굴형 ${face} 수염 ${beard}: (${x},${y})`);
    }
  }
});

test('안경은 눈동자를 가리지 않는다 · 헤어밴드는 이마 · 완장은 긴팔 위에도', () => {
  const g = px({ acc: 2 }).map;
  for (const x of [10, 14]) assert.equal(g[7][x], 'E', `안경이 눈동자(${x},7)를 덮었다`);
  assert.ok(g[6].includes('X') && g[7].includes('X'), '안경테가 없다');
  assert.equal(px({ acc: 1 }).map[4].slice(7, 17), 'X'.repeat(10));
  const arm = px({ acc: 3, jersey: 3 }).map;          // 긴팔(16~17행 소매) 위에 완장
  assert.equal(arm[16].slice(17, 19), 'XX');
});

test('머리색이 머리와 수염을 같이 바꾸고, 반바지·축구화 색이 먹는다', () => {
  const a = px({ hairColor: 9, beard: 1 });
  assert.equal(a.palette.H, PARTS.hairColor[9].color);
  assert.equal(a.palette.R, PARTS.hairColor[9].color);
  assert.equal(px({ shorts: 1 }).palette.P, '#c0392b', '"유니폼과 같음"이면 반바지 = 유니폼 색');
  assert.equal(px({ shorts: 2 }).palette.P, PARTS.shorts[2].color);
  assert.equal(px({ boots: 3 }).palette.B, PARTS.boots[3].color);
  assert.equal(px({}).palette.B, '#1a1a1a', '기본 축구화는 예전처럼 검정');
});

import { rollAvatar } from '../../src/lib/avatar.ts';
test('rollAvatar: 모든 부위가 범위 안이고, 코드로 적으면 서버 규칙을 통과한다', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const s = rollAvatar(rnd);
    for (const k of ['face', 'hair', 'skin', 'eyes', 'jersey', 'socks', 'gloves', 'tape', 'hairColor', 'beard', 'acc', 'shorts', 'boots']) {
      assert.ok(s[k] >= 0 && s[k] < PARTS[k].length, `${k}=${s[k]}`);
    }
    assert.ok(PARTS.kit.includes(s.kit));
    assert.match(serializeAvatar(s), SERVER_CODE_RE);
  }
});
test('rollAvatar: 난수가 1 에 붙어도(0.9999…) 범위를 안 넘는다', () => {
  const s = rollAvatar(() => 0.9999999999);
  assert.equal(s.face, PARTS.face.length - 1);
  assert.equal(s.beard, PARTS.beard.length - 1);
});
