# Portfolio Work Template

이 문서는 관리자에서 게시물을 업로드하거나, 저장된 게시물을 다시 수정 가능한 형태로 보관할 때 사용하는 표준 Markdown 양식입니다.

## Recommended Format

- 단일 게시물 import/export: `.md`
- 전체 백업 import/export: `.json`
- 단일 게시물은 사람이 직접 읽고 수정할 수 있어야 하므로 Markdown이 적합합니다.
- 전체 백업은 여러 게시물을 안정적으로 복원해야 하므로 JSON이 적합합니다.

## Copy Guide

- 이 파일을 복제해서 게시물별로 1개씩 작성합니다.
- 상단 frontmatter는 메타데이터, 아래 `## Sections`는 상세 본문입니다.
- 비어 있는 값은 `""` 또는 `[]`로 유지합니다.
- `visibility`는 `public`, `partial`, `private` 중 하나를 사용합니다.
- `status`는 `draft`, `published`, `archived` 중 하나를 사용합니다.
- `layout`은 `image-left`, `image-right`, `image-top`, `image-bottom`, `text-only` 중 하나를 사용합니다.
- 공개 상세에서 숨길 블록은 `hidden: true`로 기록합니다.

## Template

```md
---
id: "w-xxx"
slug: "project-slug"
title: "프로젝트 제목"
category: "카테고리"
period: "2026 Q2"
visibility: "public"
status: "published"
accent: "#2f6fed"
summary: "목록 카드에 보일 짧은 요약"
headline: "상세 페이지 상단에 보일 한 줄 소개"
thumbnailUrl: "https://example.com/thumbnail.jpg"
projectUrl: "https://example.com/project"
assetUrl: "https://example.com/case-study.pdf"
shareToken: ""
deliverables:
  - "결과물 1"
  - "결과물 2"
stack:
  - "Next.js"
  - "TypeScript"
createdAt: "2026-04-03"
updatedAt: "2026-04-03T00:00:00.000Z"
revisionCount: 1
---

## Overview

- id: "overview-001"
- title: "Overview"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""
- contentMode: "standard"
- documentBody: ""

본문:
선택 입력입니다. 프로젝트 배경, 읽는 순서, 문제 정의 앞 개요를 적습니다.

## Deliverables Notes

- 이 구간은 템플릿 설명/작성 보조용 메모입니다.
- 어떤 산출물을 남겼는지
- 어떤 범위까지 공개 가능한지
- 외부 링크를 어디에 연결할지

## Sections

### Section 1
- id: "section-001"
- title: "문제 정의"
- layout: "image-right"
- hidden: false
- imageUrl: "https://example.com/section-01.jpg"
- imageCaption: "이 블록을 설명하는 짧은 캡션"

본문:
여기에 상세 페이지 본문으로 들어갈 내용을 작성합니다.

### Section 2
- id: "section-002"
- title: "해결 과정"
- layout: "text-only"
- hidden: false
- imageUrl: ""
- imageCaption: ""

본문:
리서치, 설계, 구현, 운영, 회고 등 흐름을 계속 작성합니다.
```

## Field Notes

- `summary`: 목록 카드용 1~2문장
- `headline`: 상세 상단 대표 문장
- `overview`: 상세 본문 위에 접기/펼치기 가능한 선택형 상단 개요 섹션
- `thumbnailUrl`: 대표 썸네일
- `projectUrl`: 실제 서비스 또는 데모 링크
- `assetUrl`: PDF, 노션, 발표 자료 등
- `deliverables`: 최종 산출물 목록
- `stack`: 기술 또는 툴 목록
- `sections[].title`: 블록 제목
- `sections[].body`: 블록 본문
- `sections[].hidden`: 공개 상세 노출 여부
