// 모든 React 섬의 바깥 — 테마(짙은 톤)·한국어 기본 문구·message 를 한 번에 건다.
// App 은 감싸는 div 를 만들지 않는다(component={false}): 상단바처럼 flex 줄 안에 드는 섬이 있어서.
import { App, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { ReactNode } from 'react';
import { themeConfig } from './theme';

// 날짜 선택 달력의 요일·달 이름 — antd ko_KR 은 문구만 바꾸고, 달력은 dayjs 로케일을 따로 켜야 한국어가 된다.
dayjs.locale('ko');

export default function ThemeRoot({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={themeConfig} locale={koKR}>
      <App component={false}>{children}</App>
    </ConfigProvider>
  );
}
