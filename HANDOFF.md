# DỰ ÁN: ADC SMART & COMPOSABLE CMS - HANDOFF V7.0 (FINAL)

## PHẦN 1: QUY TẮC GIAO TIẾP TỐI ƯU TOKEN (RULES V2.0 - BẮT BUỘC TUÂN THỦ)
1. **KHÔNG IN CODE DÀI TRONG CHAT:** Tự động dùng tool hoặc lệnh `bash` để tạo/sửa file. Chỉ in đoạn thay đổi (tối đa 10 dòng).
2. **ĐỊNH DẠNG BÁO CÁO CỰC NGẮN:** Phản hồi theo cấu trúc: `[TRẠNG THÁI]`, `[ĐÃ LÀM]`, `[SỐ LẦN BUILD]`, `[GHI CHÚ]`.
3. **QUY TẮC TERMINAL:** KHÔNG TỰ CHẠY LỆNH TERMINAL. Lệnh build Backend dùng `dotnet build -v q --nologo`.
4. **QUY TẮC AI IDE (DEEPSEEK/ANTIGRAVITY):** Luôn nhắc AI tuân thủ file `.cursorrules` (tuyệt đối không dùng `any`, dùng `MenuProps`).

## PHẦN 2: TỔNG QUAN DỰ ÁN
- **Mục tiêu:** Hệ thống CMS tự động hóa từ HTML/CSS tĩnh, hỗ trợ Multi-site, Dynamic Content, Faceted Filter, RBAC 4 cấp, SEO, E-commerce, AI.
- **Kiến trúc:** Headless / Composable CMS.

## PHẦN 3: TECH STACK CỐ ĐỊNH
- **Database:** SQL Server 2022.
- **Backend:** .NET 10 (Minimal API), Dapper (`MatchNamesWithUnderscores = true`), Mapster.
- **Frontend:** Next.js 15.5.28 (App Router), React 19, Ant Design v6, Tailwind CSS, Zustand, RJSF (Dynamic Form).
- **Editor:** Tiptap (MIT License), tích hợp custom widget cho RJSF.
- **Drag & Drop:** @dnd-kit.
- **Môi trường:** Backend `5088` (Chạy qua `start-test.sh`), Frontend `3000`.

## PHẦN 4: TRẠNG THÁI DỰ ÁN HIỆN TẠI (100% COMPLETED)
### 1. Backend (88 Endpoints PASS)
- Full RESTful API: Auth, Content Types, Entries, Menus, E-commerce, SEO, Forms, RBAC, Media, Themes, Customers, AI Settings.
- Đã fix các lỗi Dapper `DBNull` (dùng Anonymous Object).
- **AI Settings:** Đã tích hợp AES-256-CBC (Master Key = SHA-256 của ENV `ADC_AI_MASTER_KEY`), Lazy Reset Token, Masked Key.
- **Customers CRM:** API Hybrid Key (`user:{userId}` cho account, `guest:{phone|email|name}` cho vãng lai).

### 2. Frontend (10 Module DONE)
- **Core:** Auth, Content Types, Entries (Tiptap/RJSF), Menus, Media.
- **Themes:** Import ZIP, Linter, Sinh Schema, Customizer.
- **E-commerce:** Orders, Variants, Promotions.
- **RBAC:** Roles, Users.
- **Settings:** SEO Redirects, AI Settings (Đã bỏ mock, gọi API thật).
- **Page Builder:** Dynamic Zone.
- **Customers CRM:** Table + Modal chi tiết (lịch sử đơn hàng).
- **Polish:** RJSF đã có `MediaWidget`, bảng responsive mobile (AntD `responsive: ['md'/'lg']`).

## PHẦN 5: CÁC QUYẾT ĐỊNH KIẾN TRÚC ĐÃ CHỐT
1. Media: File lưu ở `wwwroot/uploads` của Backend, DB lưu URL tương đối.
2. Editor: Dùng Tiptap (MIT License).
3. Dapper: Tuyệt đối không dùng `DynamicParameters` cho các trường nullable. Dùng Anonymous Object.
4. Next.js: Tắt rule `@typescript-eslint/no-explicit-any`, dùng `unknown` + type guard.
5. **Bảo mật AI Key**: Yêu cầu bắt buộc phải cấu hình ENV `ADC_AI_MASTER_KEY` trước khi chạy Production.

## PHẦN 6: CÁC FILE SOURCE OF TRUTH
- `README.md`: Yêu cầu nghiệp vụ.
- `README_API.md`: 88 endpoints (Đã đồng bộ 100%).
- `data_SmartCMS.sql`: Schema Database (27 bảng).
- `adc-cms-admin/.cursorrules`: Quy tắc code Frontend.

## PHẦN 7: NHIỆM VỤ TIẾP THEO (NẾU CÓ)
- Dự án đã đóng gói phiên bản V7.0. Các task nâng cao (Dọn dẹp Technical Debt warnings, Viết unit test, Tích hợp cổng thanh toán thực tế) sẽ được khởi tạo ở một dự án mới.
