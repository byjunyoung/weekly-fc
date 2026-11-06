import test from 'node:test';
import assert from 'node:assert/strict';
import { startView } from '../../src/react/guide/model.ts';
test('startView: 로그인 전', () => assert.deepEqual(startView({ login: false }),
  { kind: 'cta', button: '로그인하고 내 이름 고르기', hint: '메일로 6자리 코드를 받아 로그인합니다' }));
test('startView: 로그인만 함', () => assert.deepEqual(startView({ login: true, num: null }),
  { kind: 'cta', button: '내 이름 고르기', hint: '명단에 이름이 없으면 단톡방에 알려 주세요' }));
test('startView: 이름까지 고름', () => assert.deepEqual(startView({ login: true, num: 37, name: '송유림' }),
  { kind: 'linked', text: '송유림 님으로 연결됐습니다', to: '/squad/37/' }));
test('startView: 이름이 비면 "N번" 은 등번호로 부른다', () => assert.deepEqual(startView({ login: true, num: 37, name: null }, 9),
  { kind: 'linked', text: '9번 님으로 연결됐습니다', to: '/squad/37/' }));
