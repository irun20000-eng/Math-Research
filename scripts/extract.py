"""드라이브 내려받기 도구의 결과를 세션 기록에서 꺼내 Markdown 파일로 저장한다.

내려받기 도구는 문서를 base64로 돌려주는데, 그 글자를 직접 옮겨 적지 않고
세션 기록(~/.claude/projects 아래 jsonl)에 남은 도구 결과를 읽어 디코딩한다.

사용법: python3 -I scripts/extract.py <출력 폴더> [문서 ID ...]
문서 ID를 주면 그 문서만 꺼낸다. 파일 이름은 문서 제목의 날짜(YYYY-MM-DD).md 이다.
"""
import base64
import glob
import json
import os
import re
import sys

out = sys.argv[1]
want = set(sys.argv[2:])
os.makedirs(out, exist_ok=True)
found = {}

for path in glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True):
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if '"content"' not in line or 'tool_result' not in line:
                continue
            try:
                blocks = json.loads(line).get('message', {}).get('content')
            except ValueError:
                continue
            if not isinstance(blocks, list):
                continue
            for b in blocks:
                if not isinstance(b, dict) or b.get('type') != 'tool_result':
                    continue
                body = b.get('content')
                if isinstance(body, list):
                    body = ''.join(x.get('text', '') for x in body if isinstance(x, dict))
                if not isinstance(body, str) or not body.lstrip().startswith('{"content"'):
                    continue
                try:
                    doc = json.loads(body)
                    text = base64.b64decode(doc['content']).decode('utf-8')
                except (ValueError, KeyError):
                    continue
                m = re.match(r'(\d{4}-\d{2}-\d{2})', doc.get('title', ''))
                if not m or (want and doc.get('id') not in want):
                    continue
                found[m.group(1)] = '<!-- id:%s -->\n%s' % (doc['id'], text)

for date, text in sorted(found.items()):
    with open(os.path.join(out, date + '.md'), 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(date, len(text))
if not found:
    sys.exit('내려받은 문서를 찾지 못했습니다')
