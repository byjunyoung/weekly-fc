// 데이터가 아직 없을 때의 화면. 예전엔 제목만 그려서, 응답이 안 오면 본문이 통째로 빈
// 화면이 됐다(2026-09-22 카톡 인앱 신고). 기다리는 중임을 적어 두면 "깨졌다"로 읽히지 않는다.
export default function Loading({ title }: { title: string }) {
  return (
    <>
      <div className="page-head"><h1>{title}</h1><div className="actions" /></div>
      <p className="muted" role="status">불러오는 중…</p>
    </>
  );
}
