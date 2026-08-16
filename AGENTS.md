# AGENTS.md

이 문서는 `mysecondhorizon/threads-automation` 저장소에서 작업하는 개발 에이전트를 위한 장기 지침이다. 저장소 전체에 적용하며, 실제 코드와 이 문서가 다를 때는 먼저 현재 구현을 조사하고 차이를 사용자에게 설명한 뒤 안전하게 작업한다.

## 프로젝트 목적

이 프로젝트는 Cloudflare Workers와 공식 Threads API를 사용하는 Threads 자동 게시 시스템이다.

계정과 콘텐츠의 방향은 다음과 같다.

- 40대 평범한 직장인의 현실적인 일상과 생활을 다룬다.
- 광고 계정처럼 보이지 않도록 공감과 생활 콘텐츠로 신뢰를 먼저 쌓는다.
- 제품은 생활 속에서 자연스럽게 필요한 순간에만 연결한다.
- 쿠팡파트너스 수익화가 가능하되 광고성 표현과 허위 경험을 피한다.
- 최근 게시 성과와 게시 이력을 다음 콘텐츠 생성에 반영한다.
- 동일 소재, 동일 문단 구조, AI 특유의 반복 문체를 최소화한다.

## 현재 아키텍처

- 런타임: Cloudflare Workers
- Worker 진입점: `src/index.js`
- Worker 설정: `wrangler.jsonc`
- 주 데이터 저장소: Cloudflare KV의 `THREADS_KV` 바인딩
- 기본 브랜치: `main`
- 현재 저장소에는 `package.json`과 자동화된 테스트 스위트가 없다. 검증 명령을 선택할 때 이를 전제로 한다.

자동 게시의 주 실행 흐름은 다음과 같다.

```text
Cloudflare Cron
-> src/index.js scheduled()
-> src/services/auto-post/scheduler.js
-> src/services/auto-post/engine.js
-> src/services/auto-post/publisher.js
-> src/services/threads.js
-> Threads API
```

HTTP 수동 실행과 검수 게시도 같은 핵심 게시 계층을 사용한다. 새로운 게시 유형을 추가할 때 cron 경로만 고치지 말고 수동 실행, preview, 검수 게시, 상태 및 로그 경로의 영향을 함께 확인한다.

### 게시 운영 실험

현재 게시 슬롯은 KST 기준 08:10, 11:30, 14:30, 18:40의 일반 AUTO 4회와 20:30의 PRODUCT REVIEW 1회다. Cloudflare Cron은 각각 UTC `10 23`, `30 2`, `30 5`, `40 9`, `30 11`로 설정한다.

- 일반 AUTO는 제품 데이터를 생성 context에서 제외하고 제품 관련 contentType, `productId`, `productConnected`, `affiliateLinkUsed`, `affiliateDisclosureRequired`가 생성되면 게시 전에 차단한다. 일일 자동 게시 한도는 4개다.
- PRODUCT REVIEW cron은 사용 가능한 활성 제품으로 검수 후보를 KV에 저장할 뿐 Threads 게시 함수를 호출하지 않는다.
- 제품 후보는 제품 정보, 광고 고지와 활성화된 제휴 링크가 실제 제품 데이터에 있을 때만 생성한다. 고지는 본문에, 실제 링크는 첫 댓글에만 둔다.
- 제품 후보의 실제 게시는 관리자 검수 버튼이 기존 reviewed publish 경로를 호출할 때만 수행한다. 이 경로는 `productId`를 유지하고 게시 로그의 `metadata.source`를 `manual_product_test`로 기록한다.
- 수동 제품 테스트 게시는 KST 하루 1개로 제한해 AUTO 4개와 합쳐 하루 목표 최대 5개를 유지한다.

## 주요 파일과 책임

### Worker와 라우트

- `src/index.js`: Worker의 `fetch()` 및 `scheduled()` 진입점과 라우팅을 담당한다.
- `src/routes/auto-post.js`: 관리자 요청으로 자동 게시를 실행한다.
- `src/routes/auto-post-preview.js`: 게시 전 AI 결과를 생성하고 preview 데이터를 반환한다.
- `src/routes/auto-post-preview-page.js`: preview 및 검수 게시 관리자 UI를 제공한다.
- `src/routes/auto-post-publish-reviewed.js`: 사용자가 검수한 콘텐츠를 게시 계층에 전달한다.
- `src/routes/admin.js`: 관리자 로그인, 수동 Threads 게시 및 기존 관리 화면을 담당한다.
- `src/routes/products.js`, `src/routes/products-page.js`: 제품 데이터 API와 관리 UI를 담당한다. 공통 이미지 기능을 이 영역에 종속시키지 않는다.
- `src/routes/product-review.js`, `src/routes/product-review-page.js`: 제품글 후보 생성·목록 API와 수동 검수 UI를 담당한다.

### 자동 게시 서비스

- `src/services/auto-post/scheduler.js`: cron 실행, Threads 데이터 동기화, 일일 게시 한도 및 게시 간격 검사, 자동 게시 실행과 스케줄 결과 기록을 담당한다.
- `src/services/auto-post/engine.js`: context 구성, 콘텐츠 생성과 재생성, 정책 검증, 게시, 실행 상태 및 오류 처리를 총괄한다.
- `src/services/auto-post-engine.js`: 기존 import 호환성을 위한 auto-post 엔진 공개 진입점이다.
- `src/services/auto-post/publisher.js`: 프로필 확인, 본문 게시, 성공 로그 및 선택적 첫 댓글 게시를 조정한다.
- `src/services/auto-post/reviewed-publisher.js`: 검수된 글의 메타데이터를 정규화하고 검증한 뒤 공통 publisher를 호출한다.
- `src/services/auto-post/first-comment.js`: 본문 게시 후 첫 댓글을 게시한다.
- `src/services/auto-post/lock.js`: 중복 실행 방지 lock을 관리한다.
- `src/services/auto-post/daily-limit-guard.js`: 일일 자동 게시 제한을 검사한다.
- `src/services/auto-post/schedule-guard.js`: 최근 게시물과의 시간 간격을 검사한다.
- `src/services/auto-post/execution-store.js`, `schedule-store.js`, `status.js`: 실행 및 스케줄 상태를 KV에 저장하고 조회한다.

### AI, Threads API 및 운영 데이터

- `src/services/ai.js`: OpenAI 요청, structured output schema, AI 응답 정규화 및 Threads 글 생성을 담당한다.
- `src/services/post-regenerator.js`: 최근 글과의 유사도를 검사하며 구별되는 글을 재생성한다.
- `src/services/post-similarity.js`: 게시물 간 유사성 신호를 계산한다.
- `src/services/post-format.js`: 게시 text의 문단·문장 signature 계산, 최근 포맷을 피한 목표 포맷 선택 및 생성 후 포맷 검증을 담당한다. 광고 고지는 일반 본문 구조에서 분리한다.
- `src/services/auto-post-validator.js`: 텍스트 품질과 운영 정책을 최종 검증한다.
- `src/services/threads.js`: 공식 Threads API 요청을 담당한다. 게시 API 변경 시 가장 신중하게 다룬다.
- `src/services/threads-sync.js`: Threads 게시물과 insight 데이터를 KV 운영 데이터로 동기화한다.
- `src/services/logger.js`: 게시 성공/실패 로그와 구조화된 `post_log.metadata`를 저장한다.
- `src/services/history.js`: 게시 로그 및 동기화 데이터를 최근 게시 이력으로 구성한다.
- `src/services/thread-context.js`: 게시 이력, 제품, 성과 및 현재 사용 가능 정책을 다음 AI 요청의 context로 집계한다.
- `src/services/analytics.js`: 게시 성과와 메타데이터별 그룹 성과를 계산한다.
- `src/services/products.js`: 제품 데이터 저장과 조회를 담당한다. 미디어 저장소 역할을 맡기지 않는다.
- `src/services/product-review.js`: 제품글 후보 선택·생성·KV 저장, 검수 게시 입력 고정과 일일 수동 제품 게시 제한을 담당한다.
- `src/services/media.js`: 일반 및 제품 이미지가 공유하는 KV 기반 Media Library의 메타데이터 CRUD를 담당한다. R2 객체 CRUD는 수행하지 않는다.
- `src/services/media-batch.js`: 여러 이미지의 R2 업로드, Media Library 일괄 등록, Content Pool 초기 등록과 실패 시 R2 정리를 조정한다.
- `src/services/content-pool.js`: Cron이 향후 소비할 일반/제품 콘텐츠 재고의 CRUD, 가용성 판정, 후보 조회와 사용 횟수 기록을 담당한다.
- `src/services/weekly-inventory.js`: 사용 가능한 미디어·제품·Content Pool과 예상 게시 횟수를 비교해 주간 커버리지를 계산한다.
- `src/services/kv.js`: `THREADS_KV` 접근을 공통화한다.

## 프롬프트 책임과 콘텐츠 원칙

조합되는 프롬프트는 `src/prompts/threads/index.js`에서 관리한다. 규칙을 추가할 때 같은 규칙을 여러 프롬프트에 반복하지 말고 다음 책임을 유지한다.

- `identity.js`: 화자, 말투, 40대 직장인의 생활 사실성
- `policy.js`: 계정 운영 정책과 콘텐츠 다양성
- `content.js`: 콘텐츠 유형, 소재, 후킹, 본문 구조, 질문 및 마무리
- `product.js`: 제품 사실성, 제품 경험, 링크 및 경제적 이해관계 고지
- `analytics.js`: 성과 데이터의 해석과 학습 방식
- `validation.js`: 게시 직전 최종 품질 검사
- `output.js`: AI가 반환해야 하는 JSON 형식
- `index.js`: 위 프롬프트의 조합 순서와 단일 system prompt export

`src/prompts/threads-original.js`는 현재 조합 경로에 포함되지 않는 이전 단일 프롬프트다. 명시적인 마이그레이션 목적 없이 새 규칙을 이 파일에 추가하지 않는다.

콘텐츠 작성과 검증에서 다음 원칙을 지킨다.

- 항상 동일한 3문단 구조를 사용하지 않는다.
- 모든 문단 사이에 기계적으로 빈 줄을 넣지 않는다.
- `첫 문장 -> 설명 -> 결론`의 고정 패턴을 반복하지 않는다.
- 문단 수, 문장 길이, 줄바꿈과 마무리 리듬을 다양하게 한다.
- 최근 글과 소재뿐 아니라 문단 패턴과 표현 리듬도 지나치게 비슷하면 피한다.
- 일반 AUTO와 PRODUCT REVIEW는 `post-regenerator.js`에서 같은 코드 기반 format strategy를 사용한다. AI가 포맷을 자유 선택하게 두지 않는다.
- 최근 text에서 계산한 `recentFormatSignatures`를 사용하며 과거 metadata에 포맷 필드가 없어도 동작해야 한다.
- 광고 고지 문구는 법적·운영 요소로 유지하되 일반 본문의 format signature 문장·문단 수에서는 제외한다.
- 성과 표본이 적을 때 특정 유형이 우수하거나 열등하다고 성급하게 결론 내리지 않는다.

현재 `contentType`은 정확히 다음 9개 값 중 하나다.

- `순간 공감형`
- `현실 고민형`
- `작은 발견형`
- `실패·실수형`
- `의견·선택형`
- `생활 정보형`
- `제품 발견형`
- `제품 경험형`
- `제품 연결형`

이 enum을 변경할 때는 프롬프트 출력 형식, `ai.js` structured output schema, 응답 정규화, preview, validator, logger, history, context 및 analytics를 함께 점검한다.

## 게시 메타데이터와 학습 순환

AI 게시 결과와 `post_log.metadata`는 다음 필드를 사용한다.

- `style`
- `contentType`
- `topic`
- `emotion`
- `hookStyle`
- `endingStyle`
- `questionUsed`
- `productId`
- `productConnected`
- `affiliateLinkUsed`
- `affiliateDisclosureRequired`

메타데이터 흐름은 다음과 같다.

```text
AI 생성
-> 자동 게시 또는 검수 게시
-> auto-post/publisher.js
-> logger.js
-> post_log.metadata
-> history.js
-> thread-context.js
-> analytics.js
-> 다음 AI 생성 context
```

메타데이터를 추가하거나 이름을 바꿀 때는 이 순환 전체와 AI JSON schema를 원자적으로 업데이트한다. 기존 KV 로그에는 새 필드가 없을 수 있으므로 읽기 경로는 누락된 값에 안전해야 한다.

`thread-context.js`는 현재 다음 운영 신호를 집계한다.

- `todayQuestionCount`
- `todayProductConnectedCount`
- `todayAffiliateLinkCount`
- `recentContentTypes`
- `recentTopics`
- `recentEmotions`
- `recentHookStyles`
- `recentEndingStyles`
- `recentProductIds`
- `recentFormatSignatures`
- `recentFormats`

publishing context는 다음 허용 상태를 제공한다.

- `questionAvailable`
- `productConnectedAvailable`
- `affiliateLinkAvailable`

`auto-post-validator.js`의 `validateAutoPostPolicy()`는 질문형, 제품 연결, 제휴 링크의 사용 제한과 조합을 방어한다. AI 프롬프트만 신뢰하지 말고 코드 수준 검증을 유지한다.

`analytics.js`는 `contentType`, `topic`, `hookStyle`, `endingStyle`, `emotion`별로 `count`, `totalViews`, `totalInteractions`, `averageViews`, `averageEngagementRate` 등의 그룹 성과를 계산한다. 새 분석 차원을 추가할 때는 과소 표본 처리 원칙을 유지한다.

## 제품 및 제휴 링크 정책

- 제품 링크는 본문 `text`에 넣지 않는다.
- 필요한 제품 링크는 `firstComment`에 넣는다.
- 쿠팡파트너스 경제적 이해관계 고지가 필요하면 본문 `text`에 작성한다.
- 확인된 경험 정보가 없는 제품을 실제 사용 후기처럼 작성하지 않는다.
- 제품 정보가 부족하거나 사실성을 보장할 수 없으면 일반 생활 콘텐츠로 전환한다.
- 제품 콘텐츠와 일반 콘텐츠 모두 향후 같은 Media Library를 사용한다.

## 기존 TEXT 게시 보호 원칙

기존 TEXT 본문 게시와 첫 댓글 게시의 안정성이 최우선이다. 이미지 기능을 추가하면서 기존 함수를 불필요하게 리팩터링하거나 요청 방식을 통합하지 않는다.

현재 `src/services/threads.js`의 동작은 의도적으로 두 경로가 다르다.

- 본문 `publishTextPost()`는 `media_type=TEXT`와 `auto_publish_text=true`로 생성 요청에서 즉시 게시하고, 반환된 `id`를 게시물 ID로 사용한다.
- 첫 댓글 `publishTextReply()`는 TEXT 컨테이너를 만든 뒤 `publishContainer()`로 게시한다.

이 구조는 과거 Threads API의 `Media not found` 문제에 대응해 안정화된 구현이다. IMAGE 게시를 추가할 때 TEXT 요청 파라미터, 반환값 형태, 첫 댓글 흐름, 성공 로그 및 오류 step을 회귀 검증한다. 새 IMAGE 함수는 기존 TEXT 함수를 대체하기보다 별도의 명확한 경로로 추가한다.

## 공통 이미지 Media Layer 설계

이미지 기능은 `products.js` 또는 제품 전용 UI에 종속시키지 않는다. 일반 사진과 제품 사진이 공유하는 공통 미디어 계층을 만든다.

목표 흐름은 다음과 같다.

```text
이미지 원본
-> Cloudflare R2
-> Media Library
-> 게시글 생성 시 등록된 이미지 선택
-> TEXT 또는 IMAGE 게시
-> Threads
```

예상 저장 구조는 다음 필드를 기본으로 하며, 실제 구현 전 현재 코드와 API 요구사항을 다시 확인한다.

- `id`
- `sourceType`: `general | product`
- `productId`: nullable
- `objectKey`
- `imageUrl`: nullable
- `altText`
- `description`
- `active`
- `createdAt`
- `updatedAt`

설계 원칙은 다음과 같다.

- R2 bucket 이름은 `threads-media`, Worker binding 이름은 `THREADS_MEDIA`로 한다.
- 미디어 메타데이터 목록은 우선 `THREADS_KV` 기반 Media Library로 관리한다.
- R2 객체 저장과 KV 메타데이터 저장의 실패 및 정합성 처리 방식을 명시한다.
- AI가 임의의 이미지 URL이나 object key를 만들게 하지 않는다.
- AI는 코드가 제공한 활성 미디어 후보 중 `mediaId`만 선택한다.
- 실제 `imageUrl`은 게시 직전에 Media Library에서 조회하고 검증한다.
- 일반 이미지와 제품 이미지는 `sourceType`과 nullable `productId`로 구분하되 같은 서비스와 관리 UI를 사용한다.
- 향후 AI 결과의 후보 필드는 `mediaType: TEXT | IMAGE`, `mediaId`, `imageAltText`다.
- IMAGE 선택이나 조회가 실패했을 때 기존 TEXT 게시를 위험하게 자동 변환하지 않는다. fallback 정책은 구현 단계에서 명시적으로 정하고 로그에 남긴다.
- 외부에서 Threads가 접근할 이미지 URL의 공개 방식, 수명 및 보안을 구현 전에 확인한다.
- R2 bucket은 private으로 유지하고 외부 이미지 호스팅을 사용하지 않는다.
- 공개 이미지는 현재 Worker의 `/media/{mediaId}` endpoint가 Media Library의 `objectKey`를 조회한 뒤 `THREADS_MEDIA` 객체를 전달하는 방식으로 제공한다.
- 공개 URL에 R2 `objectKey`를 직접 넣지 않고 `mediaId`만 사용한다. `objectKey`와 public image URL은 저장 및 책임을 계속 분리한다.
- public base URL은 현재 workers.dev origin을 사용할 수 있어야 하며, 향후 custom domain으로 바꿀 때 미디어 레코드나 objectKey를 마이그레이션하지 않도록 요청 origin 또는 환경 설정으로 조합한다.
- 특정 workers.dev 주소를 Media Library 레코드에 고정 저장하지 않는다. `imageUrl`은 nullable을 유지하고 필요 시 현재 public base URL과 `mediaId`로 해석한다.
- 이미지 사용 이력을 기록하여 최근 이미지 중복을 방지한다.
- 업로드 시 MIME type, 파일 크기, 확장자, object key 및 관리자 인증을 검증한다.

현재 저장소에는 `THREADS_MEDIA` R2 binding, 공통 R2 저장 계층, KV Media Library, batch upload, Content Pool, 주간 재고 계산과 기능 중심 관리자 UI가 있다. `mediaId`/`imageAltText` AI 필드, Cron 후보 선택 연결 및 IMAGE 게시 함수는 아직 없다. 이미지 작업을 시작할 때 이 상태를 다시 확인한다.

## 대량 운영 이미지 게시 로드맵

목표는 일반 사진, 제품 사진과 제품 자원을 미리 대량 적재하고 Cron이 며칠에서 일주일 동안 안전하게 소비하는 것이다. 기존 TEXT 기능을 보호하며 각 단계를 독립적으로 검증한다.

1. [완료] R2 binding 및 제품과 독립된 공통 object storage
2. [완료] 일반/제품 공용 KV Media Library
3. [완료] 대량 운영 재고 기반
   - 3A: 여러 파일과 선택적 CSV manifest를 받는 관리자 batch upload, 파일별 성공/실패, R2 rollback
   - 3B: 기간·사용 횟수·cooldown·우선순위를 가진 독립 Content Pool과 Cron 후보 조회 함수
   - 3C: 사용 가능한 미디어, 제품, 제휴 링크 제품, pool 후보와 예상 Cron 횟수의 주간 커버리지
4. private R2 객체를 `/media/{mediaId}`로 전달하는 Worker endpoint, 캐시/콘텐츠 헤더, workers.dev에서 custom domain으로 교체 가능한 public URL resolver 및 preview 표시
5. `threads.js`에 기존 TEXT 함수와 분리된 IMAGE 게시 함수 추가
6. 검수 게시와 `publisher.js`에서 TEXT/IMAGE 명시적 분기
7. AI context에 코드가 검증한 Media Library 및 Content Pool 후보만 제공
8. AI structured output에 `mediaType`/`mediaId` 선택 추가
9. 실제 게시 성공 후 Media Library와 Content Pool의 사용 횟수·최근 사용 시각 기록 및 중복 방지
10. Cron scheduler에 후보 선택과 재고 부족 시 명시적 안전 정책 연결
11. 제품 데이터와 Media Library/Content Pool의 `productId` 관계 검증 강화

Batch upload는 R2 업로드 성공분만 Media Library에 한 번의 KV write로 등록한다. 개별 등록 실패 시 해당 R2 객체를 삭제하고, Media Library 전체 write 실패 시 업로드 성공 객체 전체를 rollback한다. Content Pool 등록 실패는 이미 등록된 미디어를 삭제하지 않고 partial 결과로 보고한다. CSV와 UI가 objectKey나 public URL을 임의 생성하도록 허용하지 않는다.

제품 전용 이미지 저장 로직을 만들거나 `products.js`에 이미지 배열을 넣지 않는다. 단계별 변경이 TEXT 게시에 미치는 영향을 매번 확인한다.

## 작업 절차

기능 개발 요청을 받으면 사용자가 파일을 복사하거나 여러 명령을 반복 실행하도록 요구하지 말고, 에이전트가 저장소를 직접 조사하고 가능한 범위에서 수정 및 검증한다.

기본 절차는 다음과 같다.

1. `git status --short --branch`로 브랜치와 working tree를 확인한다.
2. 관련 코드, 데이터 흐름, 기존 규칙과 호출자를 검색한다.
3. 기존 미커밋 변경이 있으면 소유권을 사용자에게 둔 채 겹침과 영향을 분석한다.
4. 변경 범위를 최소의 논리적 단위로 정한다.
5. 관련 파일을 직접 수정한다.
6. 변경한 모든 JavaScript 파일에 가능한 한 `node --check <file>`을 실행한다.
7. `git diff --check`를 실행한다.
8. 가능한 구조 검증과 핵심 회귀 검증을 수행한다.
9. 전체 `git diff`와 `git status`를 검토해 의도하지 않은 변경이 없는지 확인한다.
10. 변경 내용, 검증 결과, 남은 위험을 사용자에게 보고한다.
11. commit 전에 사용자에게 결과를 보고하고 명시적인 요청을 기다린다.

대규모 작업은 논리적인 단계로 나눈다. 안정적으로 운영 중인 기능을 단지 정리하거나 추상화하기 위해 불필요하게 변경하지 않는다.

## Git 규칙

- 기본 브랜치는 `main`이다.
- 작업 시작 전과 보고 전 `git status`를 확인한다.
- 기존 미커밋 변경을 덮어쓰거나 삭제하거나 임의로 포함하지 않는다.
- 사용자가 명시적으로 요청하지 않으면 commit 또는 push하지 않는다.
- 테스트와 diff 검토가 끝나기 전 commit하지 않는다.
- 기존 commit을 임의로 reset, amend, rebase 또는 force push하지 않는다.
- push 요청을 받으면 먼저 working tree, 대상 branch, upstream 및 push할 commit을 다시 확인한다.
- 파괴적인 Git 명령으로 문제를 해결하지 않는다.

## 검증 규칙

최소 검증 기준은 다음과 같다.

- 변경된 각 `.js` 파일: `node --check <file>`
- 모든 변경: `git diff --check`
- 변경 통계: `git diff --stat`
- 최종 검토: `git diff` 및 `git status --short --branch`

테스트 도구가 없는 현재 상태에서는 관련 import/export, 모든 호출자, KV 저장/조회 호환성, HTTP route와 cron 양쪽 경로를 정적으로 추적한다. 실행 가능한 테스트가 향후 추가되면 관련 테스트도 반드시 실행한다. 검증하지 못한 부분은 성공한 것처럼 표현하지 않고 명확히 보고한다.

## 보안 원칙

다음 값을 코드, 문서, 테스트 fixture 또는 로그에 하드코딩하지 않는다.

- OpenAI API key
- Threads access token
- OAuth secret
- 관리자 비밀번호
- Cloudflare secret 및 기타 인증 정보

기존 Cloudflare environment, secret 및 KV 구조를 유지한다. 새로운 secret은 binding 이름과 설정 방법만 문서화하고 실제 값을 저장소에 기록하지 않는다.
