#!/bin/bash
# Setup script for claudenews plugin
# Run: bash setup.sh

CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
API_URL="${CODE_EARN_API_URL:-https://claudenews.vercel.app}"

echo ""
echo "  Code\033[32mEarn\033[0m - AI 에이전트 대기 중 수익 적립"
echo ""

mkdir -p "$CONFIG_DIR"

# Check if already registered
if [ -f "$CONFIG_FILE" ]; then
  echo "이미 등록되어 있습니다."
  ENABLED=$(cat "$CONFIG_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('enabled', False))" 2>/dev/null)
  echo "광고 활성화: $ENABLED"
  echo ""
  read -p "광고를 $([ "$ENABLED" = "True" ] && echo '비활성화' || echo '활성화')하시겠습니까? (y/n) " toggle
  if [ "$toggle" = "y" ]; then
    if [ "$ENABLED" = "True" ]; then
      python3 -c "
import json
with open('$CONFIG_FILE') as f: d=json.load(f)
d['enabled']=False
with open('$CONFIG_FILE','w') as f: json.dump(d,f,indent=2)
"
      echo "광고가 비활성화되었습니다."
    else
      python3 -c "
import json
with open('$CONFIG_FILE') as f: d=json.load(f)
d['enabled']=True
with open('$CONFIG_FILE','w') as f: json.dump(d,f,indent=2)
"
      echo "광고가 활성화되었습니다!"
    fi
  fi
  exit 0
fi

# Register new user
echo "새 사용자로 등록합니다..."
MACHINE_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"machineId\": \"${MACHINE_ID}\"}")

USER_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userId',''))" 2>/dev/null)
API_KEY=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('apiKey',''))" 2>/dev/null)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "None" ]; then
  echo "등록 실패. 서버를 확인해주세요."
  exit 1
fi

# Save config
cat > "$CONFIG_FILE" << EOF
{
  "userId": "${USER_ID}",
  "apiKey": "${API_KEY}",
  "machineId": "${MACHINE_ID}",
  "apiUrl": "${API_URL}",
  "enabled": true
}
EOF

echo ""
echo "등록 완료!"
echo "API Key: ${API_KEY}"
echo "대시보드: ${API_URL}/dashboard"
echo ""
echo "광고가 활성화되었습니다. 에이전트 응답 대기 중 브라우저에 광고가 표시됩니다."
echo "비활성화하려면: bash $(dirname "$0")/setup.sh"
