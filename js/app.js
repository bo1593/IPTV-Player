/**
 * IPTV Player - Main Application
 * Supports M3U playlists with HLS (.m3u8) and TS (.ts) streams
 */

(function() {
    'use strict';

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        m3uPath: 'assets/channels.m3u',
        defaultLogo: '📺',
        maxRetries: 3,
        retryDelay: 2000,
        hlsConfig: {
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            liveSyncDurationCount: 3,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 10000,
            fragLoadingTimeOut: 20000
        }
    };

    // ==================== STATE ====================
    let channels = [];
    let currentChannelIndex = -1;
    let hls = null;
    let retryCount = 0;
    let sidebarVisible = false;

    // ==================== DOM ELEMENTS ====================
    const elements = {
        video: document.getElementById('videoPlayer'),
        channelList: document.getElementById('channelList'),
        searchInput: document.getElementById('searchInput'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        errorOverlay: document.getElementById('errorOverlay'),
        placeholder: document.getElementById('placeholder'),
        infoBar: document.getElementById('infoBar'),
        currentTitle: document.getElementById('currentTitle'),
        currentGroup: document.getElementById('currentGroup'),
        currentLogo: document.getElementById('currentLogo'),
        liveBadge: document.getElementById('liveBadge'),
        channelCount: document.getElementById('channelCount'),
        sidebar: document.getElementById('sidebar'),
        menuBtn: document.getElementById('menuBtn'),
        toggleSidebar: document.getElementById('toggleSidebar'),
        retryBtn: document.getElementById('retryBtn'),
        prevBtn: document.getElementById('prevChannel'),
        nextBtn: document.getElementById('nextChannel')
    };

    // ==================== EMOJI MAPPING ====================
    const groupEmojis = {
        'الأخبار': '📰',
        'الوثائقية': '🌍',
        'رياضة': '⚽',
        'أطفال': '🧸',
        'ترفيه': '🎬',
        'سينما': '🎥',
        'تجريبية': '🔬',
        'عام': '📺',
        'news': '📰',
        'sports': '⚽',
        'movies': '🎥',
        'kids': '🧸',
        'entertainment': '🎬',
        'documentary': '🌍',
        'test': '🔬',
        'general': '📺'
    };

    // ==================== M3U PARSER ====================
    /**
     * Parse M3U playlist content
     * @param {string} content - Raw M3U file content
     * @returns {Array} Array of channel objects
     */
    function parseM3U(content) {
        const lines = content.split(/?
/);
        const result = [];
        let current = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF:')) {
                current = {
                    title: '',
                    group: 'عام',
                    logo: '',
                    url: '',
                    id: '',
                    language: ''
                };

                // Extract title (after last comma)
                const titleMatch = line.match(/,(.+)$/);
                if (titleMatch) {
                    current.title = titleMatch[1].trim();
                }

                // Extract group-title
                const groupMatch = line.match(/group-title="([^"]*)"/);
                if (groupMatch) {
                    current.group = groupMatch[1].trim() || 'عام';
                }

                // Extract tvg-logo
                const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                if (logoMatch) {
                    current.logo = logoMatch[1].trim();
                }

                // Extract tvg-id
                const idMatch = line.match(/tvg-id="([^"]*)"/);
                if (idMatch) {
                    current.id = idMatch[1].trim();
                }

                // Extract tvg-language
                const langMatch = line.match(/tvg-language="([^"]*)"/);
                if (langMatch) {
                    current.language = langMatch[1].trim();
                }

            } else if (line && !line.startsWith('#') && current) {
                current.url = line;

                // Validate URL
                if (isValidUrl(current.url)) {
                    result.push(current);
                }

                current = null;
            }
        }

        return result;
    }

    /**
     * Check if URL is valid
     */
    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Get emoji for channel group
     */
    function getGroupEmoji(group) {
        const normalized = group.toLowerCase().trim();
        return groupEmojis[normalized] || groupEmojis[group] || '📺';
    }

    // ==================== RENDERING ====================
    /**
     * Render channel list with optional filter
     */
    function renderChannels(filter = '') {
        const groups = {};

        channels.forEach((ch, idx) => {
            if (filter && !ch.title.toLowerCase().includes(filter.toLowerCase())) {
                return;
            }
            if (!groups[ch.group]) {
                groups[ch.group] = [];
            }
            groups[ch.group].push({ ...ch, index: idx });
        });

        elements.channelList.innerHTML = '';

        // Sort groups alphabetically
        const sortedGroups = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));

        sortedGroups.forEach(([group, items]) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'mb-3 channel-item';

            const emoji = getGroupEmoji(group);

            groupDiv.innerHTML = `
                <div class="group-header px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <span class="text-lg">${emoji}</span>
                    <span>${group}</span>
                    <span class="text-gray-600 mr-auto">(${items.length})</span>
                </div>
            `;

            items.forEach(item => {
                const btn = document.createElement('button');
                const isActive = item.index === currentChannelIndex;

                btn.className = `w-full text-right px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all hover:bg-gray-700 group mb-1 ${isActive ? 'bg-emerald-900/40 border-r-2 border-emerald-500' : ''}`;
                btn.onclick = () => playChannel(item.index);

                const isHLS = item.url.includes('.m3u8') || item.url.includes('.ts');
                const fileExt = item.url.split('.').pop().split('?')[0].toUpperCase();

                btn.innerHTML = `
                    <div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-lg shrink-0 overflow-hidden">
                        ${item.logo ? 
                            `<img src="${item.logo}" class="w-full h-full object-contain" onerror="this.style.display='none'; this.parentElement.innerText='${emoji}'">` : 
                            emoji
                        }
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm truncate ${isActive ? 'text-emerald-400' : 'text-gray-200 group-hover:text-white'}">
                            ${item.title}
                        </div>
                        <div class="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                            ${isHLS ? '<span class="w-1.5 h-1.5 bg-red-500 rounded-full inline-block animate-pulse"></span>' : ''}
                            <span>${isHLS ? 'HLS' : fileExt}</span>
                            ${item.language ? `<span class="text-gray-600">| ${item.language}</span>` : ''}
                        </div>
                    </div>
                    ${isActive ? `
                        <svg class="w-5 h-5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
                        </svg>
                    ` : ''}
                `;

                groupDiv.appendChild(btn);
            });

            elements.channelList.appendChild(groupDiv);
        });

        elements.channelCount.textContent = channels.length;
    }

    // ==================== VIDEO PLAYBACK ====================
    /**
     * Play a channel by index
     */
    function playChannel(index) {
        if (index < 0 || index >= channels.length) return;

        currentChannelIndex = index;
        const channel = channels[index];
        retryCount = 0;

        // UI Updates
        elements.placeholder.classList.add('hidden');
        elements.errorOverlay.classList.add('hidden');
        elements.loadingOverlay.classList.remove('hidden');
        elements.infoBar.classList.remove('hidden');

        // Update info bar
        elements.currentTitle.textContent = channel.title;
        elements.currentGroup.textContent = channel.group;

        const emoji = getGroupEmoji(channel.group);
        elements.currentLogo.innerHTML = channel.logo ? 
            `<img src="${channel.logo}" class="w-full h-full object-contain rounded-lg" onerror="this.parentElement.innerText='${emoji}'">` : 
            emoji;

        elements.liveBadge.classList.remove('hidden');

        // Cleanup previous instance
        cleanupPlayer();

        const url = channel.url;

        // Determine stream type and play
        if (url.includes('.m3u8') || url.includes('.ts')) {
            playHLS(url);
        } else {
            playNative(url);
        }

        // Update list UI
        renderChannels(elements.searchInput.value);

        // Auto-scroll to active channel
        setTimeout(() => {
            const activeBtn = elements.channelList.querySelector('button.border-emerald-500');
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);

        // Close mobile sidebar
        if (window.innerWidth < 768) {
            toggleSidebar(false);
        }
    }

    /**
     * Play HLS stream using hls.js
     */
    function playHLS(url) {
        if (Hls.isSupported()) {
            hls = new Hls(CONFIG.hlsConfig);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                elements.loadingOverlay.classList.add('hidden');
                elements.video.play().catch(handlePlayError);
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS Error:', data);

                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            if (retryCount < CONFIG.maxRetries) {
                                retryCount++;
                                setTimeout(() => hls.startLoad(), CONFIG.retryDelay);
                            } else {
                                showError();
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            showError();
                            break;
                    }
                }
            });

            hls.loadSource(url);
            hls.attachMedia(elements.video);

        } else if (elements.video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            elements.video.src = url;
            elements.video.addEventListener('loadedmetadata', onLoaded);
            elements.video.addEventListener('error', onError);
        } else {
            showError();
        }
    }

    /**
     * Play native video stream
     */
    function playNative(url) {
        elements.video.src = url;
        elements.video.addEventListener('canplay', onLoaded);
        elements.video.addEventListener('error', onError);
    }

    /**
     * Handle successful load
     */
    function onLoaded() {
        elements.loadingOverlay.classList.add('hidden');
        elements.video.play().catch(handlePlayError);
    }

    /**
     * Handle load error
     */
    function onError() {
        if (retryCount < CONFIG.maxRetries) {
            retryCount++;
            setTimeout(() => {
                if (currentChannelIndex >= 0) {
                    playChannel(currentChannelIndex);
                }
            }, CONFIG.retryDelay);
        } else {
            showError();
        }
    }

    /**
     * Handle play error (autoplay blocked)
     */
    function handlePlayError(error) {
        console.warn('Play error:', error);
        elements.loadingOverlay.classList.add('hidden');
    }

    /**
     * Show error overlay
     */
    function showError() {
        elements.loadingOverlay.classList.add('hidden');
        elements.errorOverlay.classList.remove('hidden');
        elements.errorOverlay.classList.add('shake');
        setTimeout(() => elements.errorOverlay.classList.remove('shake'), 300);
    }

    /**
     * Cleanup player resources
     */
    function cleanupPlayer() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        elements.video.pause();
        elements.video.removeAttribute('src');
        elements.video.load();

        // Remove old event listeners
        elements.video.removeEventListener('loadedmetadata', onLoaded);
        elements.video.removeEventListener('canplay', onLoaded);
        elements.video.removeEventListener('error', onError);
    }

    // ==================== SIDEBAR ====================
    function toggleSidebar(show) {
        sidebarVisible = show !== undefined ? show : !sidebarVisible;
        elements.sidebar.classList.toggle('active', sidebarVisible);
    }

    // ==================== KEYBOARD SHORTCUTS ====================
    function handleKeyboard(e) {
        // Ignore if typing in search
        if (document.activeElement === elements.searchInput) return;

        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                if (currentChannelIndex > 0) playChannel(currentChannelIndex - 1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (currentChannelIndex < channels.length - 1) playChannel(currentChannelIndex + 1);
                break;
            case ' ':
                e.preventDefault();
                if (elements.video.paused) {
                    elements.video.play();
                } else {
                    elements.video.pause();
                }
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                elements.video.muted = !elements.video.muted;
                break;
            case 'Escape':
                if (sidebarVisible && window.innerWidth < 768) {
                    toggleSidebar(false);
                }
                break;
        }
    }

    /**
     * Toggle fullscreen
     */
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            elements.video.requestFullscreen?.() || elements.video.webkitRequestFullscreen?.();
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        }
    }

    // ==================== DATA LOADING ====================
    /**
     * Load M3U file from server
     */
    async function loadM3U() {
        try {
            const response = await fetch(CONFIG.m3uPath);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            channels = parseM3U(text);

            if (channels.length === 0) {
                throw new Error('No valid channels found');
            }

            renderChannels();
            console.log(`Loaded ${channels.length} channels`);

        } catch (error) {
            console.warn('Failed to load M3U file:', error.message);
            console.log('Using sample data...');
            loadSampleData();
        }
    }

    /**
     * Load sample/demo data
     */
    function loadSampleData() {
        const sampleM3U = `#EXTM3U
#EXTINF:-1 tvg-id="AlJazeera.qa" tvg-logo="https://upload.wikimedia.org/wikipedia/en/thumb/4/41/Al_Jazeera_logo.svg/1200px-Al_Jazeera_logo.svg.png" group-title="الأخبار",Al Jazeera
https://live-hls-web-aja.getaj.net/AJA/index.m3u8

#EXTINF:-1 tvg-id="BBCWorld.uk" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2019.svg/1200px-BBC_News_2019.svg.png" group-title="الأخبار",BBC World News
https://vs-hls-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_mobile/pc_hd_abr_v2.m3u8

#EXTINF:-1 tvg-id="France24.fr" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/France24_logo.svg/1200px-France24_logo.svg.png" group-title="الأخبار",France 24
https://ythls.armelin.one/channel/UCQfwfsi5VrK8HEJDg5SNg0w.m3u8

#EXTINF:-1 tvg-id="AlArabiya.ae" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Al_Arabiya_logo.svg/1200px-Al_Arabiya_logo.svg.png" group-title="الأخبار",Al Arabiya
https://live.alarabiya.net/alarabiapublish/alarabiya.smil/playlist.m3u8

#EXTINF:-1 tvg-id="SkyNews.uk" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Sky_News_logo.svg/1200px-Sky_News_logo.svg.png" group-title="الأخبار",Sky News
https://siloh.pluto.tv/lilo/production/SkyNews/master.m3u8

#EXTINF:-1 tvg-id="NationalGeographic.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/National_Geographic_Channel.svg/1200px-National_Geographic_Channel.svg.png" group-title="الوثائقية",National Geographic
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVNationalGeographic.us.m3u8

#EXTINF:-1 tvg-id="Discovery.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Discovery_Channel_logo.svg/1200px-Discovery_Channel_logo.svg.png" group-title="الوثائقية",Discovery Channel
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVDiscovery.us.m3u8

#EXTINF:-1 tvg-id="AnimalPlanet.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Animal_Planet_logo.svg/1200px-Animal_Planet_logo.svg.png" group-title="الوثائقية",Animal Planet
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVAnimalPlanet.us.m3u8

#EXTINF:-1 tvg-id="BeinSports1.qa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bein_sports_logo.svg/1200px-Bein_sports_logo.svg.png" group-title="رياضة",Bein Sports 1
https://livestream.com/accounts/bein1/events/live.m3u8

#EXTINF:-1 tvg-id="BeinSports2.qa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bein_sports_logo.svg/1200px-Bein_sports_logo.svg.png" group-title="رياضة",Bein Sports 2
https://livestream.com/accounts/bein2/events/live.m3u8

#EXTINF:-1 tvg-id="ESPN.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_logo.svg/1200px-ESPN_logo.svg.png" group-title="رياضة",ESPN
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVESPN.us.m3u8

#EXTINF:-1 tvg-id="CartoonNetwork.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/1200px-Cartoon_Network_2010_logo.svg.png" group-title="أطفال",Cartoon Network
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVCartoonNetwork.us.m3u8

#EXTINF:-1 tvg-id="DisneyChannel.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Disney_Channel_logo_%282014%29.svg/1200px-Disney_Channel_logo_%282014%29.svg.png" group-title="أطفال",Disney Channel
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVDisneyChannel.us.m3u8

#EXTINF:-1 tvg-id="Nickelodeon.us" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Nickelodeon_logo.svg/1200px-Nickelodeon_logo.svg.png" group-title="أطفال",Nickelodeon
https://raw.githubusercontent.com/Alstruit/adaptive-streams/main/streams/us/PlutoTVNickelodeon.us.m3u8

#EXTINF:-1 tvg-id="MBC1.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/MBC1_logo.svg/1200px-MBC1_logo.svg.png" group-title="ترفيه",MBC 1
https://shls-mbc1na-prod-dub.shahid.net/out/v1/0c3a7e893f8144fa8f62478d4f08e8b5/index.m3u8

#EXTINF:-1 tvg-id="MBC2.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/MBC2_logo.svg/1200px-MBC2_logo.svg.png" group-title="ترفيه",MBC 2
https://shls-mbc2-prod-dub.shahid.net/out/v1/b4b3a5d1b6f64a8f9d8e7c6b5a4f3e2d/index.m3u8

#EXTINF:-1 tvg-id="MBC3.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/MBC3_logo.svg/1200px-MBC3_logo.svg.png" group-title="أطفال",MBC 3
https://shls-mbc3-prod-dub.shahid.net/out/v1/c5d9f7e8b6a54f3e9d8c7b6a5f4e3d2c/index.m3u8

#EXTINF:-1 tvg-id="MBC4.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/MBC4_logo.svg/1200px-MBC4_logo.svg.png" group-title="ترفيه",MBC 4
https://shls-mbc4-prod-dub.shahid.net/out/v1/d6e8f7c9b5a44f3e8d7c6b5a4f3e2d1c/index.m3u8

#EXTINF:-1 tvg-id="RotanaCinema.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Rotana_Cinema_logo.svg/1200px-Rotana_Cinema_logo.svg.png" group-title="سينما",Rotana Cinema
https://shls-rotanacinema-prod-dub.shahid.net/out/v1/a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7/index.m3u8

#EXTINF:-1 tvg-id="RotanaAflam.sa" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Rotana_Aflam_logo.svg/1200px-Rotana_Aflam_logo.svg.png" group-title="سينما",Rotana Aflam
https://shls-rotanaaflam-prod-dub.shahid.net/out/v1/b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8/index.m3u8

#EXTINF:-1 tvg-id="TestChannel" group-title="تجريبية",Test Stream (TS)
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8

#EXTINF:-1 tvg-id="BigBuckBunny" group-title="تجريبية",Big Buck Bunny
https://test-streams.mux.dev/test_001/stream.m3u8

#EXTINF:-1 tvg-id="SampleTS" group-title="تجريبية",Sample TS Stream
https://test-streams.mux.dev/test_001/stream.m3u8`;

        channels = parseM3U(sampleM3U);
        renderChannels();
    }

    // ==================== EVENT LISTENERS ====================
    function initEventListeners() {
        // Search
        elements.searchInput.addEventListener('input', (e) => {
            renderChannels(e.target.value);
        });

        // Retry button
        elements.retryBtn.addEventListener('click', () => {
            if (currentChannelIndex >= 0) {
                retryCount = 0;
                playChannel(currentChannelIndex);
            }
        });

        // Navigation buttons
        elements.prevBtn.addEventListener('click', () => {
            if (currentChannelIndex > 0) playChannel(currentChannelIndex - 1);
        });

        elements.nextBtn.addEventListener('click', () => {
            if (currentChannelIndex < channels.length - 1) playChannel(currentChannelIndex + 1);
        });

        // Mobile menu
        elements.menuBtn?.addEventListener('click', () => toggleSidebar(true));
        elements.toggleSidebar?.addEventListener('click', () => toggleSidebar(false));

        // Keyboard
        document.addEventListener('keydown', handleKeyboard);

        // Window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                elements.sidebar.classList.remove('active');
                sidebarVisible = false;
            }
        });

        // Click outside sidebar on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth < 768 && sidebarVisible) {
                if (!elements.sidebar.contains(e.target) && !elements.menuBtn.contains(e.target)) {
                    toggleSidebar(false);
                }
            }
        });
    }

    // ==================== INITIALIZATION ====================
    function init() {
        console.log('IPTV Player v1.0 - Initializing...');

        initEventListeners();
        loadM3U();

        // Expose to global for debugging
        window.iptvPlayer = {
            channels: () => channels,
            play: playChannel,
            current: () => currentChannelIndex,
            reload: loadM3U
        };
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
