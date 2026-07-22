# History

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

## 2026-06-08

### Active Positions quick-close button

- Added a `청산` button to each `Active Positions` row.
- Clicking the button now pre-fills the trade input card with the opposite side, current open quantity, selected asset, maturity, current price, and the active FX rate so the user can record a closing trade immediately.
- The flow clears edit mode first when needed, keeps the position linked through the existing history focus key, and scrolls back to the input card to finish the entry.

Impact scope
- `Active Positions` action UI
- Trade input card autofill flow
- Position-to-history workflow continuity

Verification
- Code path reviewed locally.
- Manual browser verification not run in this workspace.

## 2026-07-06

### 로그인 사용자 단위 자동 백업 추가

- 설정 탭에 자동 백업 카드와 백업 목록/복구/삭제 UI를 추가했다.
- 로컬 백업은 로그인한 사용자 단위로만 저장하며, 최근 3개만 유지한다.
- 덮어쓰기성 작업(CSV 가져오기, 클라우드 가져오기, 전체 삭제, 클라우드 내보내기) 전에는 복구용 스냅샷을 먼저 남기도록 연결했다.
- 일반 로컬 수정은 지연 백업으로 묶어 과도한 스냅샷 생성을 줄였다.

영향 범위
- `js/app.js` 로컬 저장, 백업, 복구, 인증 상태 연동
- `index.html` 설정 탭 백업 UI
- `AGENTS.md`, `README.md`, `history.md` 운영 문서

검증
- `node --check js/app.js` 통과
- `node --check js/supabase.js` 통과
## 2026-07-09

### 체결 입력창 가격 oninput 렌더 지연 완화

- `체결가` 입력창의 `oninput` 처리에서 즉시 `renderAll()`를 호출하던 구조를 제거했다.
- 입력 중에는 짧은 지연 후 추가 매수 가능량만 갱신하도록 바꿔, 타이핑 시 화면이 밀리는 현상을 줄였다.
- 전체 대시보드 재계산은 기존처럼 다른 저장/변경 경로에서 수행되며, 가격 입력 전용 갱신은 별도 디바운스로 분리했다.

영향 범위
- 체결 입력 카드의 `체결가` 입력 반응성
- 추가 매수 가능량 표시 갱신 타이밍
- `js/app.js` 입력 이벤트 처리 흐름

검증
- 코드 수정 완료
- 로컬 브라우저 수동 검증은 아직 수행하지 않음

## 2026-07-21

### Trade History와 Performance Report에 수수료 컬럼 추가

- `Trade History`와 `Performance Report` 상세 표에 `수수료(통화)` 컬럼을 다시 추가했다.
- 수수료는 계산식을 바꾸지 않고 기존 체결별 `feeCur` 값을 그대로 표시한다.

영향 범위
- `index.html` Trade History / Performance Report 헤더
- `js/app.js` 거래/리포트 행 렌더링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### Performance Report 상세 손익 표시를 Trade History와 맞춤

- Performance Report의 상세 표에도 `실현손익`, `미실현손익`, `포지션누적(만기)`을 표시하도록 맞췄다.
- 요약 카드의 수수료/순손익 기준은 그대로 두고, 상세 표의 해석만 Trade History와 동일한 구조로 정리했다.

영향 범위
- `index.html` Performance Report 상세 표 헤더
- `js/app.js` Performance Report 상세 표 렌더링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### Trade History에 실현/미실현/포지션 누적손익 표시 추가

- Trade History의 손익 컬럼을 `실현손익`, `미실현손익`, `포지션누적(만기)`으로 바꿨다.
- 실현손익은 거래별 확정 손익을, 미실현손익은 현재 포지션 평가 손익을, 포지션 누적손익은 `상품/만기` 기준 합산 값을 보여주도록 했다.

영향 범위
- `index.html` Trade History 헤더
- `js/app.js` Trade History 손익 집계 및 행 렌더링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### Performance Report 조회 옵션에 만기일자 필터 추가

- Performance Report 조회 옵션에 `만기일자` 필터를 추가했다.
- `상품` 필터와 함께 적용되도록 해서, 조회 기간 안에서 상품/만기 조합을 더 좁혀볼 수 있게 했다.

영향 범위
- `index.html` Performance Report 필터 UI
- `js/app.js` Performance Report 필터 초기화 및 조회 필터링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### Period Trade History 상품 표시를 상품/만기로 변경

- Period Trade History의 상품 컬럼 헤더를 `상품/만기`로 바꿨다.
- 각 행은 `상품`과 `만기`를 함께 보여주도록 렌더링을 수정했다.

영향 범위
- `index.html` Period Trade History 헤더
- `js/app.js` Period Trade History 행 렌더링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### Trade History 상품 표시를 상품/만기로 변경

- Trade History의 상품 컬럼 헤더를 `상품/만기`로 바꿨다.
- 각 행은 `상품`과 `만기`를 함께 보여주도록 렌더링을 수정했다.

영향 범위
- `index.html` Trade History 헤더
- `js/app.js` Trade History 행 렌더링

검증
- 코드 수정만 반영했고 브라우저 수동 검증은 아직 하지 않았다.

## 2026-07-21

### 미실현손익 표기 및 계산 기준 분리

- Trade History와 Performance Report의 `미실현손익` 표기를 `미실현손익(행손익/잔존손익)`으로 바꿨다.
- 행손익은 각 행의 체결가와 현재가를 비교해 계산하고, 잔존손익은 평균가와 현재가를 비교해 계산하도록 분리했다.
- history/report의 미실현손익 셀은 행손익과 잔존손익을 함께 보여주도록 바꿨다.

영향 범위
- `js/app.js` 손익 계산 및 history/report 렌더링
- `index.html` 표 헤더
- `AGENTS.md` 계산 규칙과 검증 기준

검증
- 수동 UI 확인 필요

## 2026-07-21

### 미실현손익 표시 조건 조정

- 미실현손익(행손익/잔존손익) 셀은 잔존 상태일 때만 수치를 표시하도록 바꿨다.
- 잔존이 아닌 행은 `-`로 표시하고, 행손익과 잔존손익은 같은 셀 안에서만 함께 보이도록 정리했다.

영향 범위
- `js/app.js` history/report 미실현손익 셀

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 가상 행손익 복구

- Performance Report에 별도 열 `가상 미실현 손익(행손익)`을 다시 추가했다.
- 기존 `미실현손익(행손익/잔존손익)`은 잔존 손익 표시용으로 유지했다.
- 가상 행손익은 행 단가 기준으로 계산해 회색 폰트로 표시한다.

영향 범위
- `js/app.js` report 정렬 레이블, 행 데이터, 렌더링
- `index.html` report 테이블 헤더

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 렌더링 오류 수정

- `renderPerformanceReport()`에서 `virtualPnlCur`가 `rowPnlCur`를 참조하던 오류를 바로잡았다.
- 가상 행손익은 `calcTradeUnrealizedPnlCur()`를 직접 호출해 계산하도록 변경했다.

영향 범위
- `js/app.js` 퍼포먼스 리포트 행 계산

검증
- `node --check js/app.js` 통과
## 2026-07-22

### 퍼포먼스 리포트 행손익 참조 오류 수정

- `renderPerformanceReport()`의 `rowPnlCur` 참조 오류를 바로잡았다.
- `virtualPnlCur`와 `unrealizedPnlCur`는 각각 같은 행손익 계산식을 직접 사용하도록 유지했다.

영향 범위
- `js/app.js` 퍼포먼스 리포트 행 계산

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 잔존 표시 추가

- 퍼포먼스 리포트의 상태 칼럼에 잔존 배지를 추가했다.
- 잔존이 있는 경우에만 `미실현손익(행손익/잔존손익)`을 함께 표시하도록 맞췄다.
- `가상 미실현 손익(행손익)`은 각 행의 체결가를 기준으로 현재 시점까지 포지션이 살아 있었다고 가정한 행손익으로 유지했다.

영향 범위
- `js/app.js` report 상태 칼럼, 미실현손익 표시, 가상 행손익 계산

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 상태 배지 정리

- 퍼포먼스 리포트의 상태 칼럼에서 잔존 배지를 제거했다.
- 잔존 여부는 `미실현손익(행손익/잔존손익)` 표시 조건으로만 사용한다.

영향 범위
- `js/app.js` report 상태 칼럼 표시

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 표시 기준 정리

- `미실현손익(행손익/잔존손익)`은 잔존이 있는 경우에만 함께 표시하도록 유지했다.
- `가상 미실현 손익(행손익)`은 각 행의 체결가를 기준으로 현재 시점까지 살아 있었다고 가정한 행손익으로 계산하도록 정리했다.
- report 표의 잔존 표시 조건은 잔존 유무 기준으로 맞췄다.

영향 범위
- `js/app.js` history/report 렌더링 및 report 가상 행손익 계산

검증
- `node --check js/app.js` 통과

## 2026-07-22

### 퍼포먼스 리포트 잔존 배지 제거 및 행손익 음수 표시 정리

- 퍼포먼스 리포트 상태 칼럼에서 잔존 배지를 제거했다.
- `미실현손익(행손익/잔존손익)`은 잔존 값이 음수인 경우 행손익을 `-`로 표시하도록 정리했다.
- 잔존이 있는 경우에만 행손익과 잔존손익을 함께 보여주고, 잔존이 없으면 잔존 손익만 계산 흐름에 남기도록 맞췄다.

영향 범위
- `js/app.js` report 손익 breakdown 및 상태 표시

검증
- `node --check js/app.js` 통과
