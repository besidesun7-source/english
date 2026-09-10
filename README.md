# Lingo Note

PDF/DOCX 영어 수업 노트를 듣기·대화 학습으로 바꾸는 웹앱입니다.

## 인터넷에 공개하기

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
