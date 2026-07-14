---
name: kakao-channel-writer
version: 1.0.0
description: 카카오채널(카카오톡 채널) 메시지·소식글 작성. 짧은 제목+본문+버튼 CTA. brand-style.md와 content-calendar.md 기반. outputs/captions/ 또는 outputs/kakao/에 저장.
---

# Kakao Channel Writer

카카오채널은 **모바일 알림 피드**에서 읽힙니다. 길고 밀도 높은 문단은 피하고, **한 메시지 한 목적**을 지킵니다.

## 출력 규칙

- 제목 20자 내외 (잘림 방지)
- 본문 3–7줄, 이모지는 브랜드 가이드에 따름
- CTA 버튼 문구 1개 (예: 자세히 보기, 신청하기)
- `outputs/kakao/` 또는 `outputs/captions/`에 `KK-n` 형식 파일명

## 금지

- 과도한 할인·기한 압박·허위 후기
- 표시광고법 미준수 표현
- 다른 채널 글의 단순 복붙 (채널 톤에 맞게 재작성)

## 캘린더 연동

`calendar-index.json`의 `scheduledDate`·`scheduledTime`을 존중해 발행 리듬에 맞는 톤을 조절하세요.
