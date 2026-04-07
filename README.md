# 🎵 SoundCloud Downloader

**SoundCloud Downloader** is a lightweight, high-performance userscript that allows you to download SoundCloud tracks directly from your browser with high-quality ID3 metadata embedded—no external services required.

> [!TIP]
> This tool runs entirely in your browser, ensuring privacy and speed by fetching the progressive stream directly from SoundCloud's infrastructure.

## ✨ Key Features

- **Local Processing:** No third-party servers. All operations happen in your browser.
- **Rich Metadata:** Automatically embeds:
  - **Title & Artist:** Cleanly extracted from track data.
  - **Album Art:** High-quality covers (up to 1080x1080) injected directly into the ID3 tags.
  - **Album/Publisher info:** Where available.
- **Native Integration:** Minimalist "Download" button that matches the SoundCloud UI.

## 📦 Installation

### 1. Install a Userscript Manager

We recommend one of the following:

- [Tampermonkey](https://www.tampermonkey.net/) (Best compatibility)
- [Violentmonkey](https://violentmonkey.github.io/) (Open source)

### 2. Install the Script

Click the link below to install the latest version:

- [**Install SoundCloud Downloader**](https://raw.githubusercontent.com/hthienloc/Local-SoundCloud-Downloader-with-Embedded-Metadata/main/soundcloud-downloader.user.js)

## ⚠️ Known Limitations

- **Memory Usage:** The file is buffered in memory to inject metadata. Very large tracks may require significant RAM.
- **CORS Restrictions:** Some cover art may fail to download due to browser security policies. In such cases, the audio will still download without the cover.
- **Native Performance:** Uses modern Native Web APIs (File System Access & Blobs) for fast, lightweight file saving—no middleware required.

## 🛠 Tech Stack

- [ID3-Writer](https://github.com/egoroof/browser-id3-writer) - Client-side ID3 tagging.
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) - Native browser file management.

## 📄 License

This project is licensed under the [MIT License](LICENSE.md).  
*Original logic based on work by [maple3142](https://github.com/maple3142).*
