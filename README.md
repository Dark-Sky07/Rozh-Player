# ROZH Player

<div align="center">
  <img src="public/icons/rozh-256.png" width="132" alt="ROZH Player" />

  **پلیر همه‌کاره، سبک و حرفه‌ای — برای ویندوز، مک، لینوکس، اندروید، اندروید تی‌وی و وب**

  *A fast, beautiful, universal media player — Windows · macOS · Linux · Android · Android TV · Web*

  [![CI](https://img.shields.io/badge/build-passing-4ecf9a?style=flat-square)](.github/workflows/ci.yml)
  [![Release](https://img.shields.io/badge/release-v1.0.1-f8da7e?style=flat-square)](../../releases)
  [![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square)](https://tauri.app)
  [![License](https://img.shields.io/badge/license-MIT-f8a24a?style=flat-square)](LICENSE)
</div>

---

## فهرست

- [دانلود](#دانلود)
- [چرا ROZH؟](#چرا-rozh)
- [امکانات](#امکانات)
- [اجرا و نصب](#اجرا-و-نصب)
- [فرمت‌ها](#فرمت‌ها)
- [کلیدهای میان‌بر](#کلیدهای-میان‌بر)
- [ساختار پروژه](#ساختار-پروژه)
- [English](#english)

---

## دانلود

نسخهٔ آمادهٔ **v1.0.1** برای همهٔ پلتفرم‌ها در صفحهٔ [Releases](../../releases) است:

| پلتفرم | فایل |
| --- | --- |
| ویندوز ۱۰/۱۱ | `ROZH.Player_1.0.1_x64-setup.exe` |
| مک — Apple Silicon | `ROZH.Player_1.0.1_aarch64.dmg` |
| مک — Intel | `ROZH.Player_1.0.1_x64.dmg` |
| لینوکس | `.deb` · `.rpm` · `.AppImage` |
| اندروید / اندروید تی‌وی | `ROZH-Player-1.0.1.apk` |
| وب / PWA | `rozh-player-web.zip` |

<div dir="ltr">

> Builds are unsigned: Windows may show SmartScreen and macOS Gatekeeper needs a
> right-click → Open on first launch. Details in the release notes.

</div>

---

## چرا ROZH؟

اسم **ROZH** از «روژ» می‌آید: سپیده‌دم، روشنایی. لوگو هم همان خورشید طلایی شعله‌ور است و تمام
رابط کاربری از همان پالت ساخته شده — طلاییِ آتشین روی سیاهِ نیمه‌شب.

سه اصل ساده:

1. **سبک** — رابط کاربری بدون هیچ فریم‌ورک سنگین؛ فقط TypeScript و CSS خالص. حدود ۱۳۰ کیلوبایت
   جاوااسکریپت برای خود برنامه (پخش‌کننده‌های HLS/DASH فقط در صورت نیاز بارگذاری می‌شوند).
2. **همه‌کاره** — پخش ویدیو، صدا، پخش زنده، زیرنویس، اکولایزر، صف پخش، ادامه از آخرین نقطه،
   دسترسی از ریموت تلویزیون.
3. **زیبا** — شیشه‌ای، عمق‌دار، با انیمیشن‌های نرم و احترام به `prefers-reduced-motion`.

## امکانات

### پخش
- موتور پخش سفارشی روی `<video>` با کنترل‌های کامل فارسی/انگلیسی
- **HLS** (`.m3u8`) و **DASH** (`.mpd`) با بارگذاری تنبل و انتخاب کیفیت دستی/خودکار
- پخش محلی با کشیدن و رها کردن، انتخاب فایل بومی (دیالوگ سیستم) یا دکمهٔ «باز کردن»
- **صف پخش**، درهم‌سازی، تکرار (یک فایل / همه)
- **ادامه از آخرین نقطه** — هر فایل از همان ثانیه‌ای که رها کردید باز می‌شود
- سرعت پخش ۰٫۲۵× تا ۴× با حفظ زیر و بم صدا
- **حلقهٔ A-B**، پرش ۵/۳۰ ثانیه، حرکت قاب‌به‌قاب (`, .` یا `Alt+←/→`)
- نسبت تصویر (اصلی/۱۶:۹/۴:۳/۲۱:۹/پرکردن)، چرخش، آینهٔ افقی/عمودی، جلوه‌های تصویر
- تایمر خواب، قفل صفحه، نشانه‌گذاری صحنه، پنل آمار فنی، هم‌زمان‌سازی زیرنویس
- **عکس از تصویر** (PNG/JPEG) با نام‌گذاری خودکار
- تصویر در تصویر (PiP)، ارسال به تلویزیون (Cast/AirPlay)، کلیدهای رسانهٔ سیستم
- نوار پیشرفت با بافر، پیش‌نمایش زمان، حذف خودکار کنترل‌ها هنگام پخش

### زیرنویس
- SRT، WebVTT و **ASS/SSA** با موتور **libass** (JASSUB، رندر دقیق استایل‌ها)
- افزودن زیرنویس دلخواه با کشیدن روی پلیر (فایل `.srt` را روی ویدیو رها کنید)
- اندازه، رنگ، و سبک حاشیه (خط دور / سایه / کادر) با پیش‌نمایش زنده

### صدا
- **اکولایزر شش‌باندی** واقعی (Web Audio، فیلترهای Biquad) + پیش‌تنظیم‌های Bass/Voice
- گراف صدا فقط هنگام روشن‌بودن اکولایزر ساخته می‌شود؛ منابع cross-origin بی‌صدا نمی‌شوند
- نمایش آلبوم/دیسک چرخان برای فایل‌های صوتی
- کنترل صدا با اسلایدر، بی‌صدا کردن، تقویت رنگ تصویر

### کتابخانه و تاریخچه
- کتابخانهٔ محلی با **پیش‌نمایش خودکار** (قاب ویدیو در پس‌زمینه گرفته می‌شود)
- جست‌وجو و فیلتر (ویدیو / صدا / شبکه)
- تاریخچهٔ پخش با درصد پیشرفت و «ادامه از …»
- همه‌چیز روی دستگاه شماست: نه حساب، نه سرور، نه آمارگیری

### تجربهٔ کاربری
- **۴۷ زبان** با جست‌وجوی زبان و جهت‌گیری خودکار RTL/LTR؛ فارسی، کوردی و انگلیسی کامل
- طراحی **RTL/LTR** کامل، فارسی پیش‌فرض و انگلیسی با یک کلیک
- پنج رنگ تأکیدی، سه سطح شفافیت شیشه‌ای
- **حالت تلویزیون (۱۰ فوتی)**: فونت درشت، فوکوس واضح، ناوبری با ریموت
- نوار پایین برای موبایل، منوی جمع‌شو برای دسکتاپ، حرکات لمسی (سوایپ صدا/روشنایی،
  دو ضربه برای پرش)
- ذرات نورانی، انتقال‌های نرم، و احترام کامل به کاهش حرکت

## اجرا و نصب

### وب (سریع‌ترین راه)

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # خروجی استاتیک در dist/
```

نسخهٔ وب یک PWA است: از مرورگر «نصب» کنید تا مثل یک برنامهٔ مستقل باز شود.

### دسکتاپ — ویندوز، مک، لینوکس

پیش‌نیازها: [Rust](https://rustup.rs)، Node 18+، و ابزارهای سیستم Tauri
(در لینوکس: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`).

```bash
npm install
node scripts/fetch-ffmpeg.mjs     # موتور بومی برای فرمت‌های خاص (اختیاری ولی توصیه‌شده)
npm run tauri:dev                 # اجرای برنامهٔ دسکتاپ
npm run tauri:build               # ساخت نصاب
```

خروجی‌ها:

| سیستم | فایل |
| --- | --- |
| ویندوز | `src-tauri/target/release/bundle/nsis/*.exe` (و `.msi`) |
| مک | `.../bundle/dmg/*.dmg` |
| لینوکس | `.../bundle/deb/*.deb`، `.../bundle/appimage/*.AppImage` |

### اندروید و اندروید تی‌وی

```bash
npm run tauri android init            # فقط بار اول
node scripts/patch-android-tv.mjs      # افزودن LEANBACK برای اندروید تی‌وی
npm run tauri android dev             # روی دستگاه/شبیه‌ساز
npm run tauri android build -- --apk
```

برای **اندروید تی‌وی**، مانیفست تولیدشده را باز کنید و در `<activity>` اضافه کنید:

```xml
<category android:name="android.intent.category.LEANBACK_LAUNCHER" />
```

و `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`
را تنظیم کنید. برنامه خودش حالت تلویزیون را تشخیص می‌دهد و رابط را بزرگ می‌کند.

## فرمت‌ها

| بستر | ویدیو | صدا | زیرنویس | پخش زنده |
| --- | --- | --- | --- | --- |
| وب / دسکتاپ (WebView) | MP4 (H.264/H.265*), WebM (VP8/VP9/AV1), Ogg | MP3, AAC/M4A, FLAC, WAV, Opus, Ogg | SRT, VTT, ASS/SSA | HLS, DASH |
| دسکتاپ با FFmpeg بومی | **MKV, AVI, MOV, TS, M2TS, WMV, FLV, 3GP, ProRes…** | AC3, DTS, EAC3, ALAC, WMA, APE… | همه | همه |

\* H.265/HEVC به کدک نصب‌شده در سیستم‌عامل بستگی دارد.

روی دسکتاپ، اگر WebView نتواند فایلی را رمزگشایی کند، ROZH به‌طور خودکار آن را با
FFmpeg جابه‌جا (remux) یا در صورت نیاز ترنسکد می‌کند — بدون اینکه چیزی از شما بپرسد.

## کلیدهای میان‌بر

| کلید | کار |
| --- | --- |
| `Space` / `K` | پخش / توقف |
| `←` `→` | ۵ ثانیه عقب/جلو (با `Shift`: ۳۰ ثانیه) |
| `↑` `↓` | صدا |
| `J` / `L` | ۱۰ ثانیه عقب/جلو |
| `M` | بی‌صدا |
| `F` | تمام‌صفحه |
| `P` | تصویر در تصویر |
| `V` | زیرنویس |
| `C` | عکس از تصویر |
| `N` / `B` | بعدی / قبلی |
| `E` / `I` / `A` | جلوه‌ها / آمار فنی / نسبت تصویر |
| `Z` / `D` | تایمر خواب / هم‌زمان‌سازی زیرنویس |
| `Ctrl/⌘ + B` | نشانه‌گذاری صحنه |
| `Q` | صف پخش |
| `[` / `]` | سرعت پخش |
| `,` / `.` یا `Alt + ←/→` | قاب به قاب |
| `0`–`9` | پرش به درصد |
| `Ctrl/⌘ + O` | باز کردن فایل |
| `Ctrl/⌘ + L` | باز کردن لینک |
| `Ctrl/⌘ + ,` | تنظیمات |

## ساخت خودکار (CI)

هر پوش تگ با الگوی `v*` کل ماتریس را می‌سازد و ضمیمهٔ همان Release می‌کند:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

| کار | ابزار | خروجی |
| --- | --- | --- |
| Windows | `windows-latest` + NSIS | `*-setup.exe` |
| macOS | `macos-latest` × ۲ معماری | `aarch64.dmg` · `x64.dmg` |
| Linux | `ubuntu-22.04` | `deb` · `rpm` · `AppImage` |
| Android | JDK 17 + NDK 27 | `apk` · `aab` |
| وب | `ubuntu-latest` | `rozh-player-web.zip` |

---

## ساختار پروژه

```
rozh-player/
├── index.html                 # پوستهٔ HTML + صفحهٔ بوت
├── src/
│   ├── main.ts                # نقطهٔ ورود
│   ├── core/
│   │   ├── player.ts          # موتور پخش، کنترل‌ها، زیرنویس، اکولایزر
│   │   ├── shell.ts           # اسکلت برنامه، مسیریابی، کتابخانه
│   │   ├── store.ts           # تنظیمات (localStorage) + کتابخانه (IndexedDB)
│   │   ├── native.ts          # پل Tauri (asset protocol، موتور FFmpeg)
│   │   ├── i18n.ts            # فارسی / English
│   │   ├── ui.ts              # توست، کشو، مودال، پاپ‌اور
│   │   ├── icons.ts           # آیکون‌های SVG درون‌خطی
│   │   └── util.ts            # ابزارها و تشخیص پلتفرم
│   ├── views/                 # کتابخانه، پخش زنده، اخیر، تنظیمات، درباره
│   └── styles/                # theme / app / overlays / player-extras
├── src-tauri/                 # پوستهٔ بومی Rust + Tauri
│   └── src/lib.rs             # tray، remux با FFmpeg، probe، reveal
├── public/                    # فونت، آیکون‌ها، رسانهٔ نمونه، libass
├── scripts/                   # کپی libass، دریافت FFmpeg
└── docs/                      # معماری، ساخت، پروژه‌های سوم
```

جزئیات بیشتر: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) و [docs/BUILD.md](docs/BUILD.md).

## مجوز

کد پروژه تحت [MIT](LICENSE). اجزای شخص ثالث مجوز خودشان را دارند — [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

---

## English

**ROZH Player** is a lightweight, gorgeous, universal media player built with
TypeScript + Vite on the front and Tauri 2 (Rust) on the back. One codebase ships
to Windows, macOS, Linux, Android, Android TV and the web.

**Highlights**

- Custom player surface: HLS + DASH (lazy loaded), queue, shuffle, repeat,
  resume-where-you-left-off, 0.25×–4× speed with pitch preservation, A-B loop,
  frame stepping, frame capture (PNG/JPEG), PiP, Cast/AirPlay, OS media keys.
- Subtitles: SRT, WebVTT and **ASS/SSA rendered by libass (JASSUB)** with live
  size/colour/edge customisation; drop a `.srt` onto the player to load it.
- Real six-band equalizer on Web Audio, audio-only artwork view.
- Library with automatic poster-frame thumbnails (generated off the playback
  path), search, filters and resume history — all stored locally in IndexedDB.
- Bilingual UI (Persian / English) with full RTL support, five accents, three
  glass levels and a **10-foot TV mode** for Android TV remotes.
- **Native FFmpeg fallback** on desktop: containers the system webview refuses
  (MKV, AVI, TS, AC3…) are remuxed losslessly, or transcoded when necessary.

**Quick start**

```bash
npm install
npm run dev                # web / PWA
npm run tauri:dev          # desktop shell
npm run tauri:build        # installers
```

See [docs/BUILD.md](docs/BUILD.md) for per-platform prerequisites.

<div align="center">
  <sub>Crafted with ❤ for people who love film and music.</sub>
</div>
