// ==UserScript==
// @name         SoundCloud Downloader
// @namespace    https://github.com/hthienloc
// @version      1.2.9
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
    if (typeof fn !== "function") return () => {};
    obj[name] = function (...args) {
        if (type === "before") callback.apply(this, args);
        const result = fn.apply(this, args);
        if (type === "after") callback.apply(this, args);
        return result;
    };
    return () => {
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
        let resolved = false;
        const check = (url) => {
            if (resolved) return true;
            try {
                const u = new URL(url, document.baseURI);
                const clientId = u.searchParams.get("client_id");
                if (clientId) {
                    console.log("Found clientId:", clientId);
                    resolved = true;
                    cleanup();
                    resolve(clientId);
                    return true;
                }
            } catch (e) {}
            return false;
        };

        const unhookXhr = hook(XMLHttpRequest.prototype, "open", function (method, url) {
            check(url);
        }, "after");

        const unhookFetch = hook(window, "fetch", function (input) {
            const url = typeof input === "string" ? input : (input && input.url);
            if (url) check(url);
        }, "before");

        const cleanup = () => {
            unhookXhr();
            unhookFetch();
            if (observer) observer.disconnect();
        };

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.tagName === "SCRIPT" && node.src) check(node.src);
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        for (const s of document.scripts) {
            if (s.src && check(s.src)) break;
        }
    });
}

const clientIdPromise = getClientId();
let controller = null;

// helper: try to build best artwork url
function artworkBestUrl(track) {
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
    return art.replace("-large", "-t1080x1080").replace("-crop", "-t1080x1080");
}

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
        const { url } = await fetch(
            progressive.url + `?client_id=${clientId}`
        ).then((r) => r.json());
        const audioBuf = await fetchArrayBuffer(url);
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
    
    let result = null;
    try {
        result = await fetch(
            `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
                location.href
            )}&client_id=${clientId}`,
            { signal: controller.signal }
        ).then((r) => r.json());
    } catch (e) {
        console.warn("DEBUG: resolve failed", e);
    }

    // Fallback for Mixes/Discovery sets
    if ((!result || !result.kind || result.errors) && location.pathname.includes("/discover/sets/")) {
        const urn = location.pathname.split("/").filter(Boolean).pop();
        if (urn) {
            const encodedUrn = encodeURIComponent(urn);
            for (const endpoint of ["system-playlists", "discover/sets"]) {
                try {
                    const res = await fetch(
                        `https://api-v2.soundcloud.com/${endpoint}/${encodedUrn}?client_id=${clientId}`,
                        { signal: controller.signal }
                    );
                    if (res.ok) {
                        const json = await res.json();
                        if (json && !json.errors) {
                            result = json;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }
    }

    // Second Fallback: DOM Scraping (if API still fails to provide tracks)
    let scrapedTracks = [];
    const hasTracks = result && (result.tracks || (result.collection && Array.isArray(result.collection)));
    if (!hasTracks && result?.kind !== "track") {
        console.log("DEBUG: API Failed to provide tracks, trying DOM Scraping...");
        const trackLinks = document.querySelectorAll(".trackItem__trackTitle");
        if (trackLinks.length > 0) {
            scrapedTracks = Array.from(trackLinks).map(a => ({
                kind: "track_link",
                url: new URL(a.href, location.origin).pathname
            }));
            console.log(`DEBUG: Scraped ${scrapedTracks.length} tracks from DOM`);
        }
    }

    console.log("DEBUG: Resolved result:", result);

    if (result && result.kind === "track") {
        btn.el.textContent = "Download";
        btn.el.onclick = async () => {
            btn.el.textContent = "Downloading...";
            btn.el.disabled = true;
            await downloadTrack(result, clientId);
            btn.el.textContent = "Download";
            btn.el.disabled = false;
        };
        btn.attach();
    } else {
        const tracks = (result && (result.tracks || result.collection)) ? (result.tracks || result.collection) : scrapedTracks;
        if (tracks && tracks.length > 0) {
            console.log("DEBUG: Found list of tracks, length:", tracks.length);
            btn.el.textContent = "Download Album";
            btn.el.onclick = async () => {
                console.log(`[Click] Downloading ${tracks.length} tracks...`);
                btn.el.disabled = true;
                for (let i = 0; i < tracks.length; i++) {
                    btn.el.textContent = `Downloading ${i + 1}/${tracks.length}...`;
                    let trackData = tracks[i];
                    if (trackData.kind === "track_link") {
                        try {
                            trackData = await fetch(
                                `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
                                    "https://soundcloud.com" + trackData.url
                                )}&client_id=${clientId}`
                            ).then(r => r.json());
                        } catch (e) {
                            console.error("Failed to resolve scraped track", trackData.url, e);
                            continue;
                        }
                    }
                    await downloadTrack(trackData, clientId);
                }
                btn.el.textContent = "Download Album";
                btn.el.disabled = false;
            };
            btn.attach();
        } else {
            console.log("DEBUG: No tracks found via API or DOM Scraping");
        }
    }
}

load("init");
hook(history, "pushState", () => load("pushState"), "after");
window.addEventListener("popstate", () => load("popstate"));
