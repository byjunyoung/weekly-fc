# weekly-fc-backup (비공개)

WEEKLY FC 데이터 백업. 사흘마다 `backup/YYYY-MM-DD.json` 이 쌓인다(Actions → backup).
복구: 원하는 날짜 파일을 weekly-fc 의 `scripts/migrate-to-supabase.mjs` 가 받는 모양(players·rotation·fines·statLog)
그대로 `import_all` 에 넘기면 된다.
