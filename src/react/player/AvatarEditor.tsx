// src/react/player/AvatarEditor.tsx — 꾸미기 패널(2026-09-23 고도화).
// 예전엔 부위마다 글자 버튼("가르마")만 있어 눌러 봐야 모양을 알았다. 이제 모양 부위는
// **그 옵션을 입힌 작은 그림**으로, 색 부위는 **색 칸**으로 보여 주고, 부위가 열셋으로 늘어
// 한 화면에 다 늘어놓으면 길어지므로 탭 넷(얼굴·머리·옷·소품)으로 나눈다.
// 미리보기 큰 그림은 이 패널 밖(선수 페이지 왼쪽 칸)이 그대로 맡는다.
import { Button, Segmented } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { avatarFaceSvg, avatarSvg } from '../../components/avatar';
import { PARTS, rollAvatar, type AvatarSpec } from '../../lib/avatar';

type Tab = 'face' | 'hair' | 'kit' | 'acc';
const TABS: { value: Tab; label: string }[] = [
  { value: 'face', label: '얼굴' }, { value: 'hair', label: '머리' }, { value: 'kit', label: '옷' }, { value: 'acc', label: '소품' },
];

type ShapeKey = 'face' | 'hair' | 'eyes' | 'beard' | 'jersey' | 'acc';
type ColorKey = 'skin' | 'hairColor' | 'socks' | 'gloves' | 'tape' | 'shorts' | 'boots';

export default function AvatarEditor({ spec, onChange, onReset, onSave, onCancel, saving }: {
  spec: AvatarSpec; onChange: (s: AvatarSpec) => void; onReset: () => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const [tab, setTab] = useState<Tab>('face');
  const set = (patch: Partial<AvatarSpec>) => onChange({ ...spec, ...patch });

  /** 모양 부위 — 옵션마다 그 옵션을 입힌 그림. 머리 쪽은 얼굴만 잘라 크게, 몸 쪽은 전신. */
  const shapes = (key: ShapeKey, title: string, crop: 'face' | 'body') => (
    <div className="av-group" key={key}>
      <div className="label">{title}</div>
      <div className="av-grid">
        {PARTS[key].map((opt, i) => {
          const on = (spec[key] ?? 0) === i;
          const pic = crop === 'face' ? avatarFaceSvg({ ...spec, [key]: i }, 44, undefined, true) : avatarSvg({ ...spec, [key]: i }, 56, undefined, true);
          return (
            <button type="button" key={opt.id} className={`av-opt${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => set({ [key]: i })}>
              <span className="av-pic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pic }} />
              <span className="av-name">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /** 색 부위 — 색 칸. "기본"·"유니폼과 같음"·"없음"처럼 색이 비어 있는 옵션은 실제로 그려질 색을 칸에 채우고 이름을 붙인다. */
  const shownColor = (key: ColorKey, color: string): string => {
    if (color === 'kit') return spec.kit;
    if (color) return color;
    if (key === 'hairColor') return PARTS.hair[spec.hair]?.color || PARTS.skin[spec.skin]?.color || '#2a1c14';
    if (key === 'socks') return spec.kit;
    if (key === 'shorts') return '#e8e8e8';
    if (key === 'boots') return '#1a1a1a';
    return '';                                     // 장갑·테이프 "없음" — 칸을 비운다
  };
  const colors = (key: ColorKey, title: string) => (
    <div className="av-group" key={key}>
      <div className="label">{title}</div>
      <div className="av-grid">
        {PARTS[key].map((opt, i) => {
          const on = (spec[key] ?? 0) === i;
          const c = shownColor(key, opt.color);
          return (
            <button type="button" key={opt.id} className={`av-opt av-opt-color${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => set({ [key]: i })}>
              <span className={`av-swatch${c ? '' : ' is-none'}`} style={c ? { background: c } : undefined} aria-hidden="true" />
              <span className="av-name">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const kitColors = (
    <div className="av-group" key="kitColor">
      <div className="label">유니폼 색</div>
      <div className="av-grid">
        {PARTS.kit.map((hex) => {
          const on = spec.kit === hex;
          return (
            <button type="button" key={hex} className={`av-opt av-opt-color av-opt-bare${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={`유니폼 ${hex}`} onClick={() => set({ kit: hex })}>
              <span className="av-swatch" style={{ background: hex }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );

  const body: Record<Tab, ReactNode[]> = {
    face: [shapes('face', '얼굴형', 'face'), colors('skin', '피부'), shapes('eyes', '눈', 'face'), shapes('beard', '수염', 'face')],
    hair: [shapes('hair', '헤어', 'face'), colors('hairColor', '머리색')],
    kit: [kitColors, shapes('jersey', '유니폼 무늬', 'body'), colors('shorts', '반바지'), colors('socks', '양말'), colors('boots', '축구화')],
    acc: [shapes('acc', '액세서리', 'body'), colors('gloves', '장갑'), colors('tape', '손목테이프')],
  };

  return (
    <div className="card av-editor">
      <div className="card-head">
        <h2>꾸미기</h2>
        <span className="card-head-act">
          <Button size="small" disabled={saving} onClick={onCancel}>취소</Button>
          <Button size="small" type="primary" loading={saving} onClick={onSave}>저장</Button>
        </span>
      </div>
      <div className="av-bar">
        <Segmented<Tab> value={tab} onChange={setTab} options={TABS} />
        <span className="av-tools">
          <Button size="small" onClick={() => onChange(rollAvatar())}>랜덤</Button>
          <Button size="small" onClick={onReset}>되돌리기</Button>
        </span>
      </div>
      <div className="stack">{body[tab]}</div>
    </div>
  );
}
