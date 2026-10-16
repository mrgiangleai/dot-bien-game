# Đột Biến – Bắn súng góc nhìn thứ ba (đấu bot)

Game bắn súng 3D chạy trên trình duyệt (Three.js), không cần build.

## Chạy
```bash
python3 -m http.server 8765
```
Mở http://localhost:8765 (điện thoại cùng Wi‑Fi: http://<IP-máy>:8765, xoay ngang).

## Chế độ
- **Zombie (Người vs Đột biến)**: 10s chuẩn bị, sau đó ngẫu nhiên vài người thành Đột biến mẹ.
  Đột biến cào người để lây nhiễm. Đột biến hết máu sẽ bị hạ gục và hồi sinh sau 7s —
  con người phải dùng **dao (phím 2)** để kết liễu. Người thắng nếu sống sót hết giờ.
- **Đấu đội**: Xanh vs Đỏ, hồi sinh sau 3s, đội đạt 30 điểm trước thắng.
  - Luật **Deadmatch** (chọn trong menu khi bấm Đấu đội): không hồi sinh, đội nào hạ hết đối thủ
    thắng vòng (+1 điểm), rồi tự sang vòng mới. Hết 3 phút thì đội còn nhiều người hơn thắng.

Số bot (1–19) và độ khó chỉnh ở menu, hoặc trong menu tạm dừng (⚙ / Esc) → "Áp dụng số bot & chơi lại".

## Điều khiển
- PC: WASD, chuột xoay, chuột trái bắn, chuột phải hoặc giữ Q để ngắm, Space nhảy, C nằm, R nạp,
  1/2/3/4 vũ khí (4 = súng ngắm, ngắm x4, 10 viên, bắn từng phát), G lựu đạn, Tab bảng người chơi,
  V đổi góc nhìn 1/3, Esc/P cài đặt.
- Điện thoại: joystick trái, vuốt màn hình phải để xoay (giữ nút BẮN vừa bắn vừa xoay được), NHẢY / NẠP / NGẮM / NẰM / CAM, ☰ bảng người chơi.
- Bản đồ có cầu thang dẫn lên 6 khối cao để nằm bắn tỉa.

## Cấu trúc (chuẩn bị cho chơi mạng)
| File | Vai trò |
|---|---|
| `src/config.js` | Toàn bộ thông số cân bằng |
| `src/world.js` | Bản đồ, va chạm AABB, raycast |
| `src/actor.js` | Nhân vật: vật lý + trạng thái, nhận **lệnh điều khiển** (`blankCmd`) mỗi tick |
| `src/combat.js` | Bắn, dao, cào, lựu đạn, sát thương, lây nhiễm |
| `src/bot.js` | AI bot – chỉ sinh ra lệnh điều khiển giống người chơi |
| `src/input.js` | Bàn phím/chuột/cảm ứng → lệnh điều khiển |
| `src/game.js` | Vòng tick cố định 60Hz, luật chế độ chơi, camera |
| `src/hud.js`, `effects.js`, `audio.js` | Giao diện, hiệu ứng, âm thanh |

Mọi nhân vật đều được điều khiển qua một `controller.sample(dt)` trả về lệnh.
Để chơi mạng: thêm server Node + WebSocket chạy cùng vòng tick (server‑authoritative),
client gửi lệnh từ `LocalInput`, và người chơi khác dùng một `RemoteController`
nhận lệnh/trạng thái từ server. Bot vẫn chạy trên server để lấp chỗ trống.

## Mở nhanh bằng icon (macOS)
Bấm đúp **`Đột Biến.app`** (trong thư mục dự án hoặc trên Desktop) → game mở trong cửa sổ riêng,
không cần Terminal. Đóng cửa sổ là server tự tắt. Sửa code xong chỉ cần mở lại app (hoặc Cmd+R).
Nếu di chuyển thư mục dự án, chạy lại `./tools/build-app.sh` để tạo lại app.
