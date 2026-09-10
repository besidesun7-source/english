# Lingo Note

PDF/DOCX 영어 수업 노트를 듣기·대화 학습으로 바꾸는 웹앱입니다.

## 무료로 인터넷에 공개하기 — Cloudflare Workers

Cloudflare Workers Free는 개인용 소규모 서비스에 무료 구간을 제공합니다. 이 구성은 정적 웹 화면과 API 키를 사용하는 서버 기능을 함께 배포합니다. 다만 OpenAI의 음성·실시간 대화 API 사용료는 별도입니다.

1. [Cloudflare](https://dash.cloudflare.com/sign-up) 계정을 만듭니다.
2. 프로젝트 폴더에서 `npm.cmd run deploy:cloudflare`를 실행하고 브라우저 인증을 완료합니다.
3. Cloudflare 대시보드의 **Workers & Pages → lingo-note → Settings → Variables and Secrets**에서 `OPENAI_API_KEY`를 암호값으로 추가합니다.
4. 배포 주소 `https://lingo-note.<계정>.workers.dev`로 모바일과 PC에서 접속합니다.

Cloudflare Workers Free는 하루 100,000건 요청을 포함하며, 정적 파일 요청은 무료입니다. [Cloudflare 공식 요금 안내](https://developers.cloudflare.com/workers/platform/pricing/)

## Render로 인터넷에 공개하기

이 앱은 Render 같은 Node.js 웹 호스팅에 바로 배포할 수 있도록 `Dockerfile`과 `render.yaml`을 포함합니다.

1. 이 폴더를 GitHub의 비공개 저장소에 올립니다.
2. [Render](https://render.com/)에서 **New → Blueprint**를 선택하고 저장소를 연결합니다.
3. `OPENAI_API_KEY` 환경 변수에 새 OpenAI API 키를 입력합니다. 키는 GitHub나 코드에 저장하지 않습니다.
4. 배포가 끝나면 Render가 제공하는 `https://...onrender.com` 주소로 PC와 모바일 어디서나 접속할 수 있습니다.

## 로컬 실행

```powershell
$env:OPENAI_API_KEY="your_key"
npm.cmd run start
```

`OPENAI_API_KEY`가 없으면 문서 읽기와 기본 브라우저 음성은 동작하지만 고품질 음성 및 실시간 대화는 실행되지 않습니다.
