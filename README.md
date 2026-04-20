# 🎵 SoundCloud Downloader

**SoundCloud Downloader** is a lightweight, high-performance userscript that allows you to download SoundCloud tracks and albums directly from your browser with high-quality ID3 metadata embedded—no external services required.

> [!TIP]
> This tool runs entirely in your browser, ensuring privacy and speed by fetching the progressive stream directly from SoundCloud's infrastructure.

## ✨ Key Features

- **Local Processing:** No third-party servers. All operations happen in your browser.
- **Enhanced Playlist Support:** Uses advanced DOM scraping and automatic scrolling to bypass API limitations, allowing you to download entire playlists and albums regardless of their size.
- **Rich Metadata Embedding:**
  - **Title & Artist:** Cleanly extracted and tagged.
  - **High-Quality Cover Art:** Automatically resolves and injects artwork up to 1080x1080.
  - **Album Info:** Metadata injected into ID3 tags where available.
- **Seamless Integration:** Adds a native-looking "Download" button directly to the SoundCloud interface.

## 📦 Installation

### 1. Install a Userscript Manager

We recommend one of the following:

- [Tampermonkey](https://www.tampermonkey.net/) (Best compatibility)
- [Violentmonkey](https://violentmonkey.github.io/) (Open source)

### 2. Install the Script

Click the link below to install the latest version:

- [**Install SoundCloud Downloader**](https://raw.githubusercontent.com/hthienloc/Local-SoundCloud-Downloader-with-Embedded-Metadata/main/soundcloud-downloader.user.js)

## ⚠️ Known Limitations

- **Browser Memory:** Large tracks are buffered in RAM to process ID3 tagging before downloading.
- **CORS Policies:** Some cover art might be blocked by browser security policies; the script will gracefully fall back to downloading the audio without art in these rare cases.
- **Sequential Download:** For playlists, tracks are downloaded one by one to prevent browser throttling and ensure stable processing.

## 🛠 Tech Stack

- [browser-id3-writer](https://github.com/egoroof/browser-id3-writer) - Client-side ID3 tagging.
- **MutationObserver & DOM Scraping:** For dynamic UI integration and robust playlist track detection.
- **Fetch API & Blobs:** For high-performance, middleware-free audio data handling.

## 📄 License

This project is licensed under the [MIT License](LICENSE.md).  
*Original logic based on work by [maple3142](https://github.com/maple3142).*
