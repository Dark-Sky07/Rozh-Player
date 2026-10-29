# ROZH Player 1.0.0

<p align="center"><b>یک پلیر، همهٔ پلتفرم‌ها — one player, every platform.</b></p>

## دانلود / Download

| پلتفرم | فایل |
| --- | --- |
| **Windows 10/11 (x64)** | `ROZH Player_1.0.0_x64-setup.exe` |
| **macOS — Apple Silicon (M1/M2/M3/M4)** | `ROZH.Player_1.0.0_aarch64.dmg` |
| **macOS — Intel** | `ROZH.Player_1.0.0_x64.dmg` |
| **Linux (Debian/Ubuntu)** | `ROZH.Player_1.0.0_amd64.deb` |
| **Linux (Fedora/RHEL/openSUSE)** | `ROZH.Player-1.0.0-1.x86_64.rpm` |
| **Linux (هر توزیع دیگری)** | `ROZH.Player_1.0.0_amd64.AppImage` |
| **Android 7.0+ / Android TV** | `app-universal-release.apk` |
| **وب / PWA** | `rozh-player-web.zip` — از حالت فشرده خارج کنید و روی هر هاست استاتیک بگذارید |

## نصب / Install

**Windows** — فایل `setup.exe` را اجرا کنید. ویندوز SmartScreen پیام «Windows protected your PC»
می‌دهد چون بیلد امضای تجاری (code signing) ندارد؛ روی **More info → Run anyway** بزنید.

**macOS** — فایل `dmg` را باز کنید و ROZH Player را به پوشهٔ Applications بکشید. بار اول
ممکن است Gatekeeper بگوید «برنامهٔ تأیید‌نشده»؛ روی آیکون راست‌کلیک کنید و **Open** را بزنید
(یا در System Settings → Privacy & Security اجازه دهید).

**Linux** — `sudo apt install ./ROZH.Player_1.0.0_amd64.deb` یا `chmod +x` روی AppImage و اجرا.

**Android / Android TV** — APK را sideload کنید. روی تی‌وی، پس از نصب در ردیف اپ‌های
LEANBACK ظاهر می‌شود. این نسخه با کلید موقت CI امضا شده است؛ اگر بعداً نسخهٔ جدیدی نصب کنید
ممکن است لازم باشد نسخهٔ قبلی را حذف کنید.

**وب** — بعد از اکسترکت، با هر وب‌سرور استاتیکی سرو کنید (`npx serve` یا nginx). PWA است،
پس در کروم/اج می‌توانید نصبش کنید.

## چه چیزی داخل است / What's inside

- پخش HLS و DASH، زیرنویس SRT/VTT و **ASS/SSA با libass**
- ادامهٔ پخش از همان‌جا، صف، تصادفی، تکرار، سرعت ۰٫۲۵× تا ۴×، حلقهٔ A-B، گام‌فریم، عکس‌گرفتن
- اکولایزر شش‌باندی، Picture-in-Picture، Cast، کلیدهای رسانهٔ سیستم
- رابط فارسی/انگلیسی با RTL کامل، کتابخانه با کاور خودکار، تاریخچه، استریم زنده
- حالت ۱۰ فوتی برای Android TV
- روی دسکتاپ: **فالبک FFmpeg** برای MKV/AVI/TS/AC3 — ریموکس بدون افت، در صورت نیاز ترنسکد

## محدودیت‌های شناخته‌شده / Known limitations

- بیلدها **امضا نشده‌اند** (گواهی تجاری Windows/macOS در CI موجود نیست).
- **iOS** ساخته نشده؛ نیاز به گواهی Apple و حساب توسعه‌دهنده دارد.
- موتور FFmpeg همراه بسته نیست (حجم + مجوز GPL)؛ اگر `ffmpeg` را کنار برنامه بگذارید
  فالبک بومی فعال می‌شود. بدون آن هم همهٔ فرمت‌های رایج پخش می‌شوند.
- در نسخهٔ وب، MKV/AVI را مرورگر demodulate نمی‌کند — از نسخهٔ دسکتاپ استفاده کنید.

---

### فنی / Technical

Built from source at the commit tagged `v1.0.0`:

- UI: TypeScript + Vite, zero framework, ~42 kB gzip
- Shell: Tauri 2 (Rust), WebView2 / WKWebView / WebKitGTK
- Android: NDK r27, minSdk 24, arm64-v8a + armeabi-v7a + x86_64
- CI: GitHub Actions matrix (Windows · macOS ×2 · Linux · Android · Web)

`npm run tauri:build` بازتولید همین بسته‌ها روی ماشین خودتان است؛ مستندات در `docs/BUILD.md`.
