// 안내 > 처음 왔다면 「포털」 칸 — 로그인 창을 여는 버튼, 이미 이름을 골랐다면 내 선수 페이지 링크.
import { Button } from 'antd';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { useMeInfo } from '../useMe';
import { startView } from './model';

function Start() {
  const view = startView(useMeInfo());
  if (view.kind === 'linked') {
    return <p className="guide-start">{view.text} <a className="chip" href={href(view.to)}>내 선수 페이지 →</a></p>;
  }
  return (
    <div className="guide-start">
      <Button type="primary" onClick={() => window.dispatchEvent(new Event('wfc:open-me'))}>{view.button}</Button>
      <p className="muted">{view.hint}</p>
    </div>
  );
}

export default function GuideStart() {
  return <ThemeRoot><Start /></ThemeRoot>;
}
