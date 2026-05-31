---
id: "w-alpha-blotter"
slug: "alpha-blotter"
title: "Alpha Blotter: 파생상품 매매 기록/분석 웹 블로터"
category: "trading analytics tool"
period: "2026 Q2"
visibility: "public"
status: "draft"
accent: "#0f766e"
summary: "파생상품 개인 매매를 체결 단위로 기록하고, 포지션·손익·리스크를 KRW/USD 기준으로 분석하는 브라우저 기반 단일 페이지 블로터."
headline: "체결 입력부터 포지션 집계, 성과 리포트, CSV/Supabase 동기화까지 하나로 연결한 개인 트레이딩 운영 도구"
thumbnailUrl: ""
projectUrl: "https://lim6922.github.io/alpha-blotter/"
assetUrl: ""
shareToken: ""
deliverables:
  - "체결 입력/수정 및 Trade History 관리"
  - "포지션 잔량/평단/실현·미실현 손익 집계"
  - "Performance Report(요약 + 차트 + 기간 상세 거래)"
  - "CSV Import/Export 기반 로컬 백업 흐름"
  - "Supabase 로그인/가져오기/내보내기/자동 동기화"
  - "다중 상품/다중 통화(KRW/USD) 표시 체계"
stack:
  - "HTML"
  - "CSS"
  - "JavaScript (Vanilla)"
  - "Supabase"
  - "Chart.js"
createdAt: "2026-05-31"
updatedAt: "2026-05-31T00:00:00.000Z"
revisionCount: 1
---

## Overview

- id: "section-overview-alpha-blotter"
- title: "Overview"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
Alpha Blotter는 파생상품 개인 매매를 기록하고 복기하기 위한 단일 페이지 블로터입니다. 단순 가계부가 아니라 체결(Trade)과 포지션(Position)을 분리해 관리하며, 실현손익/미실현손익/누적성과를 같은 데이터 원천으로 연결해 해석 일관성을 유지하는 것을 목표로 만들었습니다.

실사용 흐름은 "체결 입력 -> 포지션 집계 확인 -> 성과 분석 -> CSV/Supabase 백업" 순서로 설계되어 있습니다. 브라우저에서 바로 실행 가능하며, 실제 개인 거래 데이터는 Public 저장소에 포함하지 않고 CSV 또는 Supabase 경로로 분리해 운영합니다.

## Deliverables Notes

- deliverable: 체결 입력/수정 및 Trade History 관리
- deliverable: 포지션 잔량/평단/실현·미실현 손익 집계
- deliverable: Performance Report(요약 + 차트 + 기간 상세 거래)
- deliverable: CSV Import/Export 기반 로컬 백업 흐름
- deliverable: Supabase 로그인/가져오기/내보내기/자동 동기화
- deliverable: 다중 상품/다중 통화(KRW/USD) 표시 체계
- stack: HTML
- stack: CSS
- stack: JavaScript (Vanilla)
- stack: Supabase
- stack: Chart.js

## Sections

### Section 1
- id: "section-alpha-blotter-001"
- title: "문제 정의"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
개인 트레이딩 기록은 시간이 지나면 "왜 이 체결을 했는지", "현재 포지션 리스크가 어느 수준인지", "수익이 체결 단위/포지션 단위 중 어디서 발생했는지"가 빠르게 흐려집니다. 기존 메모형 기록 방식은 숫자는 남아도 해석 기준이 흔들리고, 성과 요약과 원장 상세가 서로 다른 값을 보여주는 문제가 자주 발생합니다.

Alpha Blotter는 이 문제를 해결하기 위해, 체결 원장과 포지션 집계, 성과 차트를 한 화면 흐름으로 묶었습니다. 핵심은 보기 좋은 시각화가 아니라 계산 의미의 일치입니다.

### Section 2
- id: "section-alpha-blotter-002"
- title: "핵심 도메인 설계"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
이 프로젝트는 도메인 규칙을 명시적으로 유지합니다.
- Trade(체결): 입력의 최소 단위
- Position(포지션): 여러 체결의 합산 보유 상태
- Close(청산): 기존 포지션을 줄이거나 종료하는 체결
- Realized/Unrealized PnL: 확정 손익과 평가 손익 분리

또한 통화 기준(KRW/USD)을 명확히 나눠 표시합니다. 합산 기준 통화와 환율 기준(`globalFX`, 개별 `fxRate`)을 구분해, 서로 다른 통화 숫자를 설명 없이 같은 값처럼 보여주지 않도록 설계했습니다.

### Section 3
- id: "section-alpha-blotter-003"
- title: "구현 구조와 데이터 흐름"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
프레임워크 없이 `index.html + css/style.css + js/app.js` 중심으로 구성된 SPA 구조입니다. 핵심 계산/상태/렌더링은 `js/app.js`에 집중되어 있으며, `renderAll()`이 화면 갱신의 중심 흐름을 담당합니다.

현재 구조에서는 추상화보다 명시성을 우선합니다. 기능 추가 시 계산 함수와 DOM 갱신 로직을 분리해 정합성 리스크를 줄이고, 동일 수치를 여러 화면에서 공유할 때는 공통 포맷/계산 헬퍼를 재사용하는 방향으로 유지보수합니다.

### Section 4
- id: "section-alpha-blotter-004"
- title: "분석 화면과 검증 포인트"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
성과 리포트는 요약 카드, 기간별 거래 상세, 차트 분석을 결합합니다. 차트는 장식 요소가 아니라 계산 검증 도구로 사용하며, 축/툴팁/테이블이 같은 계산 원천을 참조하도록 유지합니다.

검증 시에는 다음을 최소 체크로 둡니다.
- 체결 입력 후 히스토리 반영 정확성
- 포지션 잔량/평단 계산 일관성
- 실현/미실현/누적 손익 간 모순 여부
- 다중 상품 선택 시 시리즈 분리 가독성
- 모바일 폭에서 핵심 수치와 액션 버튼 가독성

### Section 5
- id: "section-alpha-blotter-005"
- title: "데이터 안전과 동기화 운영"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
데이터 입출력은 CSV Import/Export와 Supabase 동기화를 함께 지원합니다. Import는 덮어쓰기 성격이 강하므로 사용자 경고와 상태 표시를 명확히 하고, 자동 동기화 실패 시 조용히 데이터가 사라지지 않도록 상태 UI와 실제 동작을 일치시키는 것을 운영 원칙으로 둡니다.

Public 저장소에는 실거래 원본 데이터를 올리지 않는 정책을 고정했습니다. 실데이터는 Private 저장소 또는 개인 Supabase 프로젝트에서만 관리하고, 본 저장소는 UI/로직 코드와 운영 문서 중심으로 유지합니다.

### Section 6
- id: "section-alpha-blotter-006"
- title: "결과와 다음 단계"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
Alpha Blotter는 개인 트레이딩 기록 업무를 "입력-집계-분석-백업"의 하나의 루프로 연결한 운영형 도구입니다. 특히 체결 기준과 포지션 기준을 분리하고, KRW/USD 다중 통화 환경에서 숫자 의미를 보존하는 데 중점을 두었습니다.

향후에는 계산/렌더링/동기화 모듈 분리, 통화/손익 포맷 헬퍼 정리, 차트 데이터 생성 로직 분리, 핵심 계산 함수 테스트 도입을 통해 유지보수성과 회귀 안정성을 강화할 계획입니다.

### Section 7
- id: "section-alpha-blotter-007"
- title: "인수인계용 기술 설계도 (비공개)"
- layout: "text-only"
- hidden: true
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
이 섹션은 개발 담당자가 바뀌어도 유지보수를 이어갈 수 있도록 핵심 기술 구조와 운영 절차를 정리한 비공개 인수인계 노트입니다.

1. 아키텍처 개요
- 런타임: 브라우저 기반 단일 페이지 앱(SPA)
- 화면 골격: `index.html`
- 스타일: `css/style.css`
- 핵심 앱 로직: `js/app.js`
- 동기화 설정: `js/supabase.js`
- 운영 기준 문서: `AGENTS.md`, 변경 로그: `history.md`

2. 핵심 도메인 계약
- 거래 단위(Trade)와 포지션 단위(Position) 계산은 분리 유지
- 청산 판정은 시각 상태가 아니라 잔량/재고 로직 기준
- 실현손익/미실현손익/누적손익은 동일 계산 원천 사용
- KRW/USD 혼합 데이터는 합산 기준 통화를 명시하고, 환율 적용 기준(`globalFX`, `fxRate`)을 일관되게 적용

3. 상태/렌더링 흐름
- `js/app.js` 내 전역 상태를 기준으로 입력/계산/렌더링이 이어진다.
- `renderAll()`이 주요 UI 재계산/재렌더 트리거 역할을 수행한다.
- 기능 추가 시 계산 함수와 DOM 갱신 함수를 분리해 회귀 범위를 줄인다.
- 동일 수치가 여러 영역(요약/테이블/차트)에 노출될 때 공통 포맷터를 재사용한다.

4. 데이터 입출력 및 동기화 경계
- CSV Import: 로컬 상태를 덮어쓸 수 있으므로 사용자 경고/상태 표시 필수
- CSV Export: 로컬 최신 입력을 외부 백업으로 반출
- Supabase 동기화: 로그인 -> 가져오기/내보내기/자동 동기화 흐름
- 실패 원칙: 자동 동기화 실패 시 무음 손실 금지(상태 UI와 실제 동작 일치)

5. 변경 시 필수 점검 항목
- 체결 입력 후 Trade History 반영
- 포지션 잔량/평단/청산 상태 계산
- 실현/미실현/누적 손익 정합성
- 성과 차트 축/툴팁 단위 표기(KRW/USD)
- 다중 상품 시리즈 분리와 모바일 가독성
- CSV Export -> Import 왕복 시 의미 손실 여부

6. 리스크가 큰 변경 유형
- 손익 계산식, 청산 판정, 환율 기준 변경
- CSV 컬럼 구조 변경
- Supabase 스키마/권한 또는 동기화 흐름 변경
- `renderAll()` 호출 경로 변경

7. 운영 원칙
- Public 저장소에는 실거래 원본 데이터를 커밋하지 않는다.
- 계산 기준 또는 운영 규칙 변경 시 `AGENTS.md`와 `history.md`를 같은 작업 단위로 갱신한다.
- 인코딩 손상 방지를 위해 최소 라인 패치 우선, 패치 후 의도하지 않은 전역 문자 변경 여부를 `git diff`로 확인한다.
