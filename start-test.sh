#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== DỌN DẸP PORT CŨ ===${NC}"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5088 | xargs kill -9 2>/dev/null

cleanup() {
    echo -e "\n${RED}🛑 Đang dừng các tiến trình...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    pkill -f "dotnet run"
    pkill -f "next start"
    echo -e "${GREEN}✅ Đã dừng an toàn.${NC}"
    exit
}
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}=== BUILD FRONTEND (CHỜ XÍU) ===${NC}"
cd adc-cms-admin
# Xóa cache cũ và build bản production
rm -rf .next
npm run build

echo -e "${GREEN}▶ Khởi động Backend (Release Mode)...${NC}"
cd ..
dotnet run -c Release --project src/AdcSmartCms.Api/AdcSmartCms.Api.csproj --urls "http://localhost:5088" &
BACKEND_PID=$!

echo -e "${GREEN}▶ Khởi động Frontend (Production Mode)...${NC}"
cd adc-cms-admin
npm run start -- -p 3000 &
FRONTEND_PID=$!
cd ..

echo -e "${BLUE}==================================================${NC}"
echo -e "Hệ thống TEST MODE đang chạy. Nhấn ${RED}Ctrl+C${NC} để tắt."
echo -e "${BLUE}==================================================${NC}"

wait
