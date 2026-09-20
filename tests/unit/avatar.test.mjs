import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatar, serializeAvatar, randomAvatar, avatarSpecFor, isUnsetAvatar, PARTS, UNSET_AVATAR } from '../../src/lib/avatar.ts';
import { avatarSvg } from '../../src/components/avatar.ts';

// 서버 검증 정규식(server/weeklyfc-apps-script.js isValidAvatarCode)을 그대로 복사한다 —
// 클라이언트가 만드는 코드가 서버에서 거부되지 않는다는 계약을 이 테스트가 지킨다.
const SERVER_CODE_RE = /^([a-z]\d{1,2}:){1,8}k#[0-9a-fA-F]{3,6}$/;

test('serializeAvatar ↔ parseAvatar 왕복: 각 부품 인덱스가 그대로 돌아온다', () => {
  for (let face = 0; face < PARTS.face.length; face++) {
    for (let hair = 0; hair < PARTS.hair.length; hair++) {
      const spec = { face, hair, skin: 2, eyes: 1, kit: '#1a2b3c' };
      const code = serializeAvatar(spec);
      assert.deepEqual(parseAvatar(code), spec);
      assert.equal(serializeAvatar(parseAvatar(code)), code);
    }
  }
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
  // UNSET_AVATAR는 빈 문자열 — 서버 계약상 빈 값은 "기본으로 되돌리기"로 허용된다(정규식 밖이 맞음).
  assert.equal(serializeAvatar(UNSET_AVATAR), '');
});

test('avatarSpecFor: 저장된 코드가 없으면 randomAvatar, 있으면 parseAvatar와 같은 결과', () => {
  assert.deepEqual(avatarSpecFor(9, ''), randomAvatar(9));
  assert.deepEqual(avatarSpecFor(9, undefined), randomAvatar(9));
  const code = serializeAvatar({ face: 1, hair: 2, skin: 3, eyes: 4, kit: '#112233' });
  assert.deepEqual(avatarSpecFor(9, code), parseAvatar(code));
});

test('avatarSvg: 정상 스펙은 SVG 문자열을 요청한 크기로 낸다', () => {
  const svg = avatarSvg(randomAvatar(9), 28);
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="28" height="28"/);
});

test('avatarSvg: 미설정 스펙은 번호-원 폴백을 그린다', () => {
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

