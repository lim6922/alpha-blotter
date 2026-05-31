# History

## 2026-05-31

### Alpha Blotter 포트폴리오 포스팅 드래프트 문서 추가

- `portfolio-alpha-blotter-draft.md` 파일을 신규 추가했다.
- `dashboard/docs/portfolio-dashboard-draft.md`의 서술 스타일을 참고해, `portfolio-work-template.md` 형식(frontmatter + overview + sections)에 맞춰 Alpha Blotter 프로젝트 소개 초안을 작성했다.
- 프로젝트 목적, 도메인 규칙(체결/포지션 분리), 구현 구조, 분석 검증 포인트, CSV/Supabase 동기화 및 데이터 안전 원칙을 섹션 단위로 정리했다.

영향 범위
- 포트폴리오/문서화 자산(신규 드래프트 파일)

검증
- 템플릿 필드 구조와 섹션 블록 형식 수동 점검 완료
- 앱 런타임 동작에는 영향 없음

### Alpha Blotter 드래프트에 인수인계용 히든 섹션 추가

- `portfolio-alpha-blotter-draft.md`에 `Section 7`(인수인계용 기술 설계도)을 추가했다.
- `hidden: true`로 설정해 공개 상세에는 노출되지 않도록 구성했다.
- 아키텍처 개요, 도메인 계약, `renderAll()` 중심 렌더링 흐름, CSV/Supabase 동기화 경계, 변경 시 점검 항목, 고위험 변경 유형, 운영 원칙을 정리했다.

영향 범위
- 포트폴리오 드래프트 문서(비공개 인수인계 섹션)

검증
- 섹션 메타데이터(`id`, `title`, `hidden`) 및 템플릿 형식 수동 점검 완료
- 앱 런타임 동작 영향 없음

## 2026-05-28

### Supabase Data API explicit grants migration

- Added `migrations/20260528_explicit_data_api_grants.sql`.
- The migration grants the `authenticated` role the table privileges required by the app's `supabase-js` sync flow.
- The migration also grants schema usage and sequence usage/select for public-table inserts that rely on serial or identity defaults.

Impact scope
- Supabase cloud sync setup and future table-creation workflow.

Verification
- SQL syntax and grant scope reviewed locally. Supabase SQL Editor execution was not run in this workspace.

`history.md`는 `alpha-blotter`의 개발 히스토리를 누적적으로 관리하는 문서다.

- append-only 원칙을 따른다.
- 과거 기록 정정이 필요하면 기존 내용을 지우지 않고 정정 항목을 추가한다.
- 실제 반영된 변경만 기록한다.

---

## 2026-04-05

### 문서 운영 규칙 추가

- `Harness.md`에 `README.md` 업데이트 규칙을 추가했다.
- `Harness.md`에 `history.md` 운영 규칙을 추가했다.
- `history.md` 신규 문서를 생성했다.

영향 범위
- 문서 운영 프로세스
- 인수인계 기준

검증
- 문서 생성 및 내용 반영 확인

## 2026-05-26

### 트레이드 히스토리 행 `관련보기` 버튼 추가

- Trade History 각 행의 액션 셀에 `관련보기` 버튼을 추가했다.
- 버튼 클릭 시 해당 체결의 포지션 키(`asset_maturity`) 기준으로 히스토리 포커스를 적용하도록 기존 `focusHistoryByPosition()` 흐름을 재사용한다.

영향 범위
- Trade History 테이블 행 액션 UI
- 히스토리 포커스 필터 진입 동선

검증
- 코드 반영 완료 (수동 UI 검증 미실시)

## 2026-05-26

### Harness 인코딩 점검/패치 규칙 추가

- `Harness.md`(운영 기준 문서)에 인코딩 점검 규칙을 추가했다.
- 최소 라인 패치 우선, 전체 재저장 제한, 패치 후 전역 문자 변경 감지 시 즉시 원복 등 패치 안전 규칙을 명시했다.
- 한글 라벨/문서 깨짐 검증 체크리스트를 추가했다.

영향 범위
- 문서 운영 및 코드 수정 절차
- 인코딩/줄바꿈 관련 변경 안전성

검증
- 문서 반영 완료 (앱 동작 영향 없음)

## 2026-05-26

### Period Trade History `관련보기` 버튼 추가 및 Harness 인코딩 복구

- Period Trade History(기간 내 거래 상세) 각 행에 `관련보기` 버튼을 추가했다.
- 버튼 클릭 시 해당 거래의 포지션 키(`asset_maturity`)로 Trade History 포커스를 적용하도록 `focusHistoryByPosition()`을 연결했다.
- `AGENTS.md`(Harness) 내 깨진 인코딩 블록을 제거하기 위해 문서를 HEAD 기준으로 복구 후, 인코딩 점검/패치 규칙을 정상 한글 텍스트로 재반영했다.

영향 범위
- Performance 탭 상세 거래 테이블 UI(`repDetailTable`)
- Trade History 포커스 진입 동선
- 운영 문서 인코딩 안정성 규칙

검증
- 코드/문서 반영 완료 (수동 UI 검증 미실시)
