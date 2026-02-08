# Alpha Blotter

개인 트레이딩 기록을 관리하기 위한  
**브라우저 기반 블로터(Blotter) 도구**입니다.

이 프로젝트는 **UI/로직 코드 전용(Public)** 저장소이며,  
실제 개인 트레이딩 데이터는 포함하지 않습니다.

---

## 🔗 실행 주소 (GitHub Pages)

👉 https://lim6922.github.io/alpha-blotter/

브라우저에서 바로 실행됩니다.  
설치가 필요 없습니다.

---

## 📂 저장소 구성

alpha-blotter/
├─ index.html # 메인 화면
├─ css/ # 스타일 파일
└─ js/ # 애플리케이션 로직


---

## 🔒 개인 데이터 관리 방식 (중요)

- 실제 트레이딩 데이터는 **별도의 Private GitHub 저장소**에서 관리합니다.
- 이 Public 저장소에는 **실제 데이터(CSV)가 포함되지 않습니다.**
- 데이터는 **CSV Import / Export 방식**으로 사용합니다.

---

## 📥 데이터 불러오기 (Import)

1. 앱 실행 (위 GitHub Pages 주소)
2. **CSV Import 버튼 클릭**
3. 개인 트레이딩 데이터 CSV 파일 선택
   - 예: `blotter.csv`
4. 데이터가 화면에 로드됩니다

👉 CSV 파일은 **개인 Private 저장소에서 다운로드**합니다.

---

## 📤 데이터 저장하기 (Export)

1. 앱에서 거래 기록 입력 / 수정
2. **CSV Export 버튼 클릭**
3. CSV 파일 저장
4. 개인 데이터 저장소에 덮어쓰기 후 커밋

👉 데이터 동기화는 **Private 저장소에서 Git으로 관리**합니다.

---

## ⚠️ 주의 사항

- 이 저장소는 **데모/실행용 UI**입니다.
- 개인 금융 데이터, 실계좌 정보는 업로드하지 마세요.
- 실데이터는 반드시 **Private 저장소**에서만 관리하세요.

---

## 🧠 권장 사용 패턴 요약

- Public 저장소 (`alpha-blotter`)
  - 실행 / 분석 / UI
- Private 저장소 (`alpha-blotter-data`)
  - 실제 CSV 데이터
  - Git으로 백업 & 동기화
