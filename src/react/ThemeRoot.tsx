// 모든 React 섬의 바깥 — 테마(짙은 톤)·한국어 기본 문구·message 를 한 번에 건다.
// App 은 감싸는 div 를 만들지 않는다(component={false}): 상단바처럼 flex 줄 안에 드는 섬이 있어서.
import { App, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import type { ReactNode } from 'react';
import { themeConfig } from './theme';

export default function ThemeRoot({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={themeConfig} locale={koKR}>
      <App component={false}>{children}</App>
    </ConfigProvider>
  );
}
