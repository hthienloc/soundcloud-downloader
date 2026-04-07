// ==UserScript==
// @name         SoundCloud Downloader
// @namespace    https://github.com/hthienloc
// @version      1.2.5
// @description  Download SoundCloud tracks with embedded ID3 metadata (title, artist, album, cover art) locally.
// @author       hthienloc (based on maple3142)
// @match        https://soundcloud.com/*
// @require      https://cdn.jsdelivr.net/npm/browser-id3-writer@4.0.0/dist/browser-id3-writer.min.js
// @grant        none
// @license      MIT
// @icon         https://a-v2.sndcdn.com/assets/images/sc-icons/favicon-2cadd14bdb.ico
// @updateURL    https://raw.githubusercontent.com/hthienloc/Local-SoundCloud-Downloader-with-Embedded-Metadata/main/soundcloud-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/hthienloc/Local-SoundCloud-Downloader-with-Embedded-Metadata/main/soundcloud-downloader.user.js
// ==/UserScript==

/* jshint esversion: 8 */

function hook(obj, name, callback, type) {
    const fn = obj[name];
    obj[name] = function (...args) {
        if (type === "before") callback.apply(this, args);
        fn.apply(this, args);
        if (type === "after") callback.apply(this, args);
    };
    return () => {
        // restore
        obj[name] = fn;
    };
}

function triggerDownload(url, name) {
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = url;
    a.download = name;
    a.click();
    a.remove();
}

const btn = {
    init() {
        this.el = document.createElement("button");
        this.el.textContent = "Download";
        this.el.classList.add("sc-button");
        this.el.classList.add("sc-button-medium");
        this.el.classList.add("sc-button-icon");
        this.el.classList.add("sc-button-responsive");
        this.el.classList.add("sc-button-secondary");
        this.el.classList.add("sc-button-download");
    },
    cb() {
        // Try playlist header first (Standard for Album/Playlist/System pages)
        let header = document.querySelector(".systemPlaylistDetails__controls");
        if (header) {
            // Check if already attached
            if (header.contains(this.el)) return;

            const wrapper = document.createElement("div");
            wrapper.className = "systemPlaylistDetails__button";
            wrapper.appendChild(this.el);

            // Try to find "Add to Next up" to insert after it
            const nextUp = header.querySelector(".addToNextUp");
            if (nextUp && nextUp.parentElement && nextUp.parentElement.parentElement === header) {
                nextUp.parentElement.insertAdjacentElement("afterend", wrapper);
            } else {
                header.appendChild(wrapper);
            }
            return;
        }

        // Try standard track button group (Standard for Track pages)
        let par = document.querySelector(".sc-button-toolbar .sc-button-group");
        if (par && this.el.parentElement !== par) {
            par.insertAdjacentElement("beforeend", this.el);
        }
    },
    attach() {
        this.detach();
        this.observer = new MutationObserver(this.cb.bind(this));
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.cb();
    },
    detach() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        // If attached via wrapper, remove the wrapper too
        if (this.el.parentElement && this.el.parentElement.classList.contains("systemPlaylistDetails__button")) {
            this.el.parentElement.remove();
        } else if (this.el.parentElement) {
            this.el.remove();
        }
    }
};

btn.init();

function getClientId() {
    return new Promise((resolve) => {
        const restore = hook(
            XMLHttpRequest.prototype,
            "open",
            function (method, url) {
                const u = new URL(url, document.baseURI);
                const clientId = u.searchParams.get("client_id");
                if (!clientId) return;
                console.log("got clientId", clientId);
                restore();
                resolve(clientId);
            },
            "after"
        );
    });
}

const clientIdPromise = getClientId();
let controller = null;

// helper: try to build best artwork url
function artworkBestUrl(track) {
    // track.artwork_url often contains e.g. -large.jpg ; try t500x500 or original; fallback to user avatar
    let art = track.artwork_url || (track.user && track.user.avatar_url) || null;
    if (
        !art &&
        track.publisher_metadata &&
        track.publisher_metadata.artwork &&
        track.publisher_metadata.artwork.url
    ) {
        art = track.publisher_metadata.artwork.url;
    }
    if (!art) return null;
    // replace size placeholders commonly used by SoundCloud
    return art.replace("-large", "-t1080x1080").replace("-crop", "-t1080x1080");
}

// fetch arrayBuffer with simple error handling
async function fetchArrayBuffer(url, signal) {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error("Fetch failed: " + resp.status);
    return resp.arrayBuffer();
}

async function downloadTrack(track, clientId) {
    try {
        const progressive =
            track.media &&
            track.media.transcodings &&
            track.media.transcodings.find(
                (t) => t.format && t.format.protocol === "progressive"
            );
        if (!progressive) {
            console.warn("Track unsupported:", track.title);
            return;
        }
        // get the actual progressive audio URL
        const { url } = await fetch(
            progressive.url + `?client_id=${clientId}`
        ).then((r) => r.json());
        // fetch audio as ArrayBuffer (required to write ID3)
        const audioBuf = await fetchArrayBuffer(url);
        // try to fetch artwork
        let coverBuf = null;
        const artUrl = artworkBestUrl(track);
        if (artUrl) {
            try {
                coverBuf = await fetchArrayBuffer(artUrl);
            } catch (e) {
                console.warn("cover fetch failed", e);
                coverBuf = null;
            }
        }

        // Use browser-id3-writer to set tags
        let filename = (track.title || "track").trim().replace(/\.(mp3|wav|flac|ogg|m4a)$/i, "") + ".mp3";
        filename = filename.replace(/[\/\\?%*:|"<>]/g, "_");

        let taggedBlob = null;
        try {
            const writer = new ID3Writer(audioBuf);
            if (track.title) writer.setFrame("TIT2", track.title);
            if (track.user && track.user.username)
                writer.setFrame("TPE1", [track.user.username]);
            if (
                track.publisher_metadata &&
                track.publisher_metadata.album_title
            ) {
                writer.setFrame("TALB", track.publisher_metadata.album_title);
            }
            if (coverBuf) {
                let mime = "image/jpeg";
                const dv = new Uint8Array(coverBuf);
                if (dv[0] === 0x89 && dv[1] === 0x50 && dv[2] === 0x4e)
                    mime = "image/png";
                writer.setFrame("APIC", {
                    type: 3,
                    data: coverBuf,
                    description: "Cover",
                    mime: mime
                });
            }
            writer.addTag();
            taggedBlob = writer.getBlob();
        } catch (e) {
            console.warn("ID3 tagging failed, falling back to raw file", e);
            taggedBlob = new Blob([audioBuf], { type: "audio/mpeg" });
        }

        // Save (Album downloads should always use fallback to avoid many pickers)
        const urlObj = URL.createObjectURL(taggedBlob);
        triggerDownload(urlObj, filename);
        setTimeout(() => URL.revokeObjectURL(urlObj), 60 * 1000);

    } catch (err) {
        console.error("Download failed", track.title, err);
    }
}

async function load(by) {
    btn.detach();
    console.log("load by", by, location.href);
    if (
        /^(\/(you|stations|stream|upload|search|settings))/.test(
            location.pathname
        ) && !location.pathname.includes("/sets/")
    )
        return;
    const clientId = await clientIdPromise;
    console.log("DEBUG: Using clientId:", clientId);
    if (controller) {
        controller.abort();
        controller = null;
    }
    controller = new AbortController();
    let result = await fetch(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
            location.href
        )}&client_id=${clientId}`,
        { signal: controller.signal }
    )
        .then((r) => {
            console.log("DEBUG: API Resolve status:", r.status);
            return r.json();
        })
        .catch((e) => {
            console.warn("DEBUG: resolve failed", e);
            return {};
        });

    // Fallback for Mixes/System Playlists (resolve often 404s for discovery sets)
    if ((!result || !result.kind) && location.pathname.includes("/discover/sets/")) {
        const urn = location.pathname.split("/").filter(Boolean).pop();
        if (urn) {
            console.log("DEBUG: Trying system-playlists fallback for URN:", urn);
            result = await fetch(
                `https://api-v2.soundcloud.com/system-playlists/${urn}?client_id=${clientId}`,
                { signal: controller.signal }
            )
                .then((r) => {
                    console.log("DEBUG: Fallback status:", r.status);
                    return r.json();
                })
                .catch((e) => {
                    console.warn("DEBUG: fallback failed", e);
                    return {};
                });
        }
    }

    console.log("DEBUG: Resolved result:", result);

    if (result.kind === "track") {
        console.log("DEBUG: Matched kind: track");
        btn.el.textContent = "Download";
        btn.el.onclick = async () => {
            btn.el.textContent = "Downloading...";
            btn.el.disabled = true;
            await downloadTrack(result, clientId);
            btn.el.textContent = "Download";
            btn.el.disabled = false;
        };
        btn.attach();
    } else if (result.kind === "playlist" || result.kind === "system-playlist" || result.kind === "album") {
        console.log("DEBUG: Matched kind:", result.kind);
        btn.el.textContent = "Download Album";
        btn.el.onclick = async () => {
            const tracks = result.tracks || [];
            btn.el.disabled = true;
            for (let i = 0; i < tracks.length; i++) {
                btn.el.textContent = `Downloading ${i + 1}/${tracks.length}...`;
                await downloadTrack(tracks[i], clientId);
            }
            btn.el.textContent = "Download Album";
            btn.el.disabled = false;
        };
        btn.attach();
    } else {
        console.log("DEBUG: No download button for kind:", result.kind);
    }
    console.log("DEBUG: load finished");
}

load("init");
hook(history, "pushState", () => load("pushState"), "after");
window.addEventListener("popstate", () => load("popstate"));
