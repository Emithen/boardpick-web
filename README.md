# boardPICK Web

`boardpick/` 백엔드의 REST API를 사용하는 독립적인 React 프런트엔드입니다.

## 로컬 실행

1. 백엔드를 `http://localhost:8080`에서 실행합니다.
2. 이 폴더에서 `pnpm install` 후 `pnpm dev`를 실행합니다.
3. `http://localhost:5174`로 접속합니다.

Vite가 `/api`, `/oauth2`, `/login/oauth2`를 백엔드로 프록시합니다. 세션 로그인은 브라우저 쿠키를 사용합니다. 백엔드의 개발용 CORS 설정이 `http://localhost:5174`를 허용하므로 이 주소로 접속해야 합니다. Google 로그인을 테스트하려면 백엔드에 실제 OAuth 클라이언트 값이 필요합니다.

Google OAuth 설정은 프런트엔드가 아닌 백엔드의 [`../boardpick/.env.example`](../boardpick/.env.example)을 참고하세요. 실제 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`은 백엔드의 Git 제외 파일인 `.env` 또는 IntelliJ 실행 구성의 환경 변수에만 넣습니다. Spring Boot는 `.env` 파일을 자동으로 읽지 않으므로, `.env`를 쓴다면 실행 전에 환경 변수로 로드해야 합니다. 프런트엔드의 `VITE_` 변수에는 비밀키를 넣지 마세요.

게임 탐색과 추천, 게임 리스트, 회원가입·로그인, 내 리스트, 관리자 게임 관리 화면을 포함합니다. 관리자 화면은 로그인 ID가 `admin`인 계정에만 표시되며 실제 권한 검사는 백엔드에서 수행합니다.

백엔드가 개인 리스트도 전체 리스트 API에 반환하므로 화면에서는 공개 리스트와 로그인한 본인의 리스트만 노출합니다. API 자체의 접근 제어는 백엔드에서 별도로 해결해야 합니다. 현재 백엔드에는 추가 리스트 생성이나 공개 여부 변경 API가 없어 해당 기능은 제공하지 않습니다.
